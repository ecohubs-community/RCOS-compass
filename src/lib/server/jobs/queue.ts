import { and, asc, eq, lte, or, sql } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { job, type Job } from '../db/schema/jobs.js';

/**
 * The job queue. docs/00-architecture.md §6.
 *
 * Delivery is **at-least-once**: a worker that dies mid-job leaves a claim that
 * expires, and the job runs again. Every handler must therefore be idempotent —
 * stated on the table, in the handler type, and asserted by a test.
 */

export const DEFAULT_VISIBILITY_MS = 60_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 60 * 60_000;

export type EnqueueOptions = {
	kind: string;
	payload?: unknown;
	/** Earliest run time. Defaults to now. */
	runAfter?: number;
	maxAttempts?: number;
};

export function enqueue(db: Db, clock: Clock, options: EnqueueOptions): Job {
	const now = clock.now();
	const row = {
		id: newId(),
		kind: options.kind,
		payload: (options.payload ?? {}) as object,
		status: 'pending' as const,
		runAfter: new Date(options.runAfter ?? now),
		lockedUntil: null,
		attempts: 0,
		maxAttempts: options.maxAttempts ?? 5,
		lastError: null,
		createdAt: new Date(now),
		updatedAt: new Date(now)
	};
	db.insert(job).values(row).run();
	return row;
}

/**
 * Atomically take up to `limit` jobs that are due.
 *
 * Eligible: `pending` and due, or `running` with an expired claim — which is how
 * a job orphaned by a crashed process comes back.
 */
export function claim(
	db: Db,
	clock: Clock,
	{ limit = 1, visibilityMs = DEFAULT_VISIBILITY_MS } = {}
): Job[] {
	const now = clock.now();

	return db.transaction((tx) => {
		const due = tx
			.select()
			.from(job)
			.where(
				and(
					lte(job.runAfter, new Date(now)),
					or(
						eq(job.status, 'pending'),
						and(eq(job.status, 'running'), lte(job.lockedUntil, new Date(now)))
					)
				)
			)
			.orderBy(asc(job.runAfter), asc(job.id))
			.limit(limit)
			.all();

		return due.map((row) => {
			tx.update(job)
				.set({
					status: 'running',
					lockedUntil: new Date(now + visibilityMs),
					attempts: sql`${job.attempts} + 1`,
					updatedAt: new Date(now)
				})
				.where(eq(job.id, row.id))
				.run();
			return { ...row, status: 'running' as const, attempts: row.attempts + 1 };
		});
	});
}

export function complete(db: Db, clock: Clock, id: string): void {
	db.update(job)
		.set({ status: 'done', lockedUntil: null, lastError: null, updatedAt: new Date(clock.now()) })
		.where(eq(job.id, id))
		.run();
}

/** Exponential backoff, capped. Deterministic so a test can assert it. */
export function backoffMs(attempts: number): number {
	return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
}

/**
 * Record a failure. Retries with backoff until `maxAttempts`, then moves the job
 * to `dead`, where an operator sees it on the instance status page rather than it
 * being retried forever.
 */
export function fail(db: Db, clock: Clock, id: string, error: unknown): 'retry' | 'dead' {
	const now = clock.now();
	const current = db.select().from(job).where(eq(job.id, id)).get();
	if (!current) return 'dead';

	const message = error instanceof Error ? error.message : String(error);
	const exhausted = current.attempts >= current.maxAttempts;

	db.update(job)
		.set({
			status: exhausted ? 'dead' : 'pending',
			lockedUntil: null,
			runAfter: new Date(now + backoffMs(current.attempts)),
			lastError: message.slice(0, 2_000),
			updatedAt: new Date(now)
		})
		.where(eq(job.id, id))
		.run();

	return exhausted ? 'dead' : 'retry';
}

export function findJob(db: Db, id: string): Job | undefined {
	return db.select().from(job).where(eq(job.id, id)).get();
}

/** For the instance status page: jobs that gave up. */
export function deadLetters(db: Db, limit = 50): Job[] {
	return db.select().from(job).where(eq(job.status, 'dead')).limit(limit).all();
}

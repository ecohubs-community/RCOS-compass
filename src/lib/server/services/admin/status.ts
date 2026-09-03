import { sql } from 'drizzle-orm';
import { getConfig } from '../../config.js';
import { getDb, type Db } from '../../db/index.js';
import { job } from '../../db/schema/jobs.js';
import { community } from '../../db/schema/tenancy.js';

/**
 * "Is anything broken right now." docs/05-admin-console.md §3.5.
 *
 * Counts and sizes only, like everything else the console may see: how much
 * work is queued, what has given up, how large the database has grown. Nothing
 * here reads a payload — a job's payload can carry a document id, and a page
 * that renders payloads would be a content surface by accident.
 */

export type QueueDepth = { kind: string; pending: number; running: number; dead: number };

export type DeadJob = {
	id: string;
	kind: string;
	attempts: number;
	/** The handler's message, truncated. Never the payload. */
	lastError: string | null;
	updatedAt: number;
};

export type InstanceStatus = {
	buildSha: string;
	/** The last migration the database has applied, by name. */
	migration: { applied: number; latest: string | null };
	database: { bytes: number; path: string };
	tenants: { active: number; suspended: number; deleted: number };
	queue: QueueDepth[];
	deadJobs: DeadJob[];
	/** Which optional subsystems are wired up at all. */
	subsystems: { ai: string; mail: 'smtp' | 'unconfigured' };
};

/** The applied-migrations table drizzle maintains for itself. */
type MigrationRow = { hash: string; created_at: number };

function migrationState(db: Db): InstanceStatus['migration'] {
	try {
		const rows = db.all<MigrationRow>(
			sql`select hash, created_at from __drizzle_migrations order by created_at`
		);
		return { applied: rows.length, latest: rows.at(-1)?.hash ?? null };
	} catch {
		// A database that has never been migrated has no such table. Saying so is
		// more useful than failing the page that exists to report problems.
		return { applied: 0, latest: null };
	}
}

function databaseBytes(db: Db): number {
	try {
		const [row] = db.all<{ bytes: number }>(
			sql`select page_count * page_size as bytes from pragma_page_count(), pragma_page_size()`
		);
		return row?.bytes ?? 0;
	} catch {
		return 0;
	}
}

export function instanceStatus(db: Db = getDb()): InstanceStatus {
	const config = getConfig();

	const tenants = { active: 0, suspended: 0, deleted: 0 };
	for (const row of db.select({ status: community.status }).from(community).all()) {
		tenants[row.status] += 1;
	}

	const queue = new Map<string, QueueDepth>();
	for (const row of db.select({ kind: job.kind, status: job.status }).from(job).all()) {
		const entry = queue.get(row.kind) ?? { kind: row.kind, pending: 0, running: 0, dead: 0 };
		if (row.status === 'pending') entry.pending += 1;
		if (row.status === 'running') entry.running += 1;
		if (row.status === 'dead') entry.dead += 1;
		queue.set(row.kind, entry);
	}

	const deadJobs = db
		.select({
			id: job.id,
			kind: job.kind,
			attempts: job.attempts,
			lastError: job.lastError,
			updatedAt: job.updatedAt
		})
		.from(job)
		.where(sql`${job.status} = 'dead'`)
		.orderBy(sql`${job.updatedAt} desc`)
		.limit(20)
		.all()
		.map((row) => ({
			...row,
			lastError: row.lastError?.slice(0, 300) ?? null,
			updatedAt: row.updatedAt.getTime()
		}));

	return {
		buildSha: config.BUILD_SHA,
		migration: migrationState(db),
		// The path, not the URL: a URL could carry credentials for a future driver.
		database: { bytes: databaseBytes(db), path: config.DATABASE_URL.replace(/^file:/, '') },
		tenants,
		queue: [...queue.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
		deadJobs,
		subsystems: {
			ai: config.AI_PROVIDER,
			mail: config.SMTP_URL.length > 0 ? 'smtp' : 'unconfigured'
		}
	};
}

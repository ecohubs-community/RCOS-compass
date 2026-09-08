import { createHash } from 'node:crypto';
import { desc, eq, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { errorReport, mailFailure } from '../db/schema/operations.js';
import { scrubText } from '../scrub.js';

/**
 * Failures, where somebody can see them. `docs/00-architecture.md` §11,
 * `docs/05-admin-console.md` §3.5.
 *
 * Until now an unhandled error reached a log file and stopped there, which for a
 * two-community pilot with one operator means it reached nobody. This is the
 * smallest thing that fixes that, and deliberately not a third-party tracker:
 * adding one in the same phase that publishes a sub-processor list would make
 * the list longer for a pilot that will not fill a page of errors.
 *
 * **Grouped by fingerprint, never one row per occurrence.** The failure mode of
 * an error table is a broken route writing four hundred identical rows and
 * burying everything else; what an operator needs is what is failing and how
 * badly, which is a count.
 */

/** A fortnight of errors is more than a pilot needs and less than a liability. */
export const ERROR_RETENTION_MS = 30 * 24 * 60 * 60_000;

/**
 * Error name plus the top frames, hashed.
 *
 * The frames rather than the message, because a message often carries the id
 * that varies between occurrences and the frames do not — grouping on the
 * message would produce four hundred groups of one.
 */
export function fingerprintOf(error: unknown): string {
	const name = error instanceof Error ? error.name : typeof error;
	const frames = (error instanceof Error ? (error.stack ?? '') : '')
		.split('\n')
		.slice(1, 4)
		.map((line) => line.trim().replace(/:\d+:\d+\)?$/, ''))
		.join('|');
	return createHash('sha256').update(`${name}\n${frames}`).digest('hex').slice(0, 32);
}

export function recordError(
	db: Db,
	input: {
		error: unknown;
		route: string | null;
		requestId: string | null;
		communityId: string | null;
		now: number;
	}
): void {
	const fingerprint = fingerprintOf(input.error);
	const raw = input.error instanceof Error ? input.error.message : String(input.error);
	const at = new Date(input.now);

	db.insert(errorReport)
		.values({
			id: newId(),
			fingerprint,
			// Through the same rules as the logs. The message is stored; the values
			// interpolated into it are not.
			message: scrubText(raw),
			route: input.route,
			requestId: input.requestId,
			communityId: input.communityId,
			count: 1,
			firstSeenAt: at,
			lastSeenAt: at
		})
		.onConflictDoUpdate({
			target: errorReport.fingerprint,
			set: {
				count: sql`${errorReport.count} + 1`,
				lastSeenAt: at,
				// The most recent occurrence's request id, so an operator holding a
				// screenshot can find the one they were sent.
				requestId: input.requestId,
				route: input.route
			}
		})
		.run();
}

export type ErrorEntry = {
	fingerprint: string;
	message: string;
	route: string | null;
	requestId: string | null;
	count: number;
	firstSeenAt: number;
	lastSeenAt: number;
};

export function recentErrors(db: Db, limit = 20): ErrorEntry[] {
	return db
		.select()
		.from(errorReport)
		.orderBy(desc(errorReport.lastSeenAt))
		.limit(limit)
		.all()
		.map((row) => ({
			fingerprint: row.fingerprint,
			message: row.message,
			route: row.route,
			requestId: row.requestId,
			count: row.count,
			firstSeenAt: row.firstSeenAt.getTime(),
			lastSeenAt: row.lastSeenAt.getTime()
		}));
}

export function sweepErrors(db: Db, now: number): { removed: number } {
	const cutoff = new Date(now - ERROR_RETENTION_MS);
	const removed = db.delete(errorReport).where(lte(errorReport.lastSeenAt, cutoff)).run();
	const mail = db.delete(mailFailure).where(lte(mailFailure.at, cutoff)).run();
	return { removed: removed.changes + mail.changes };
}

/**
 * A message that did not arrive, without the address it did not arrive at.
 *
 * `docs/05` §3.5 asks the status page for delivery failures and nothing recorded
 * them. The recipient is deliberately absent: this table exists to make
 * operational problems visible, and an address in it would be a second place
 * personal data lives for no operational gain. What somebody debugging follows
 * is the invitation or the community, both of which are here.
 */
export function recordMailFailure(
	db: Db,
	input: {
		kind: string;
		communityId?: string | null;
		subject?: string | null;
		error: unknown;
		now: number;
	}
): void {
	db.insert(mailFailure)
		.values({
			id: newId(),
			kind: input.kind,
			communityId: input.communityId ?? null,
			subject: input.subject ?? null,
			error: scrubText(input.error instanceof Error ? input.error.message : String(input.error)),
			at: new Date(input.now)
		})
		.run();
}

export type MailFailureEntry = {
	kind: string;
	communityId: string | null;
	subject: string | null;
	error: string;
	at: number;
};

export function recentMailFailures(db: Db, limit = 20): MailFailureEntry[] {
	return db
		.select()
		.from(mailFailure)
		.orderBy(desc(mailFailure.at))
		.limit(limit)
		.all()
		.map((row) => ({
			kind: row.kind,
			communityId: row.communityId,
			subject: row.subject,
			error: row.error,
			at: row.at.getTime()
		}));
}

/** Only for the suite: the count behind one fingerprint. */
export const errorCount = (db: Db, fingerprint: string): number =>
	db.select().from(errorReport).where(eq(errorReport.fingerprint, fingerprint)).get()?.count ?? 0;

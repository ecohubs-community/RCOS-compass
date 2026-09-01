import { and, eq, gte, sql } from 'drizzle-orm';
import type { Clock } from './clock.js';
import type { Db } from './db/index.js';
import { rateLimitBucket } from './db/schema/rate-limit.js';

/**
 * Sliding-window rate limiting in SQLite. docs/01-server-client-contract.md §5.
 *
 * P0 provides the mechanism and IP-based limiting. The per-user and
 * per-community limits (docs/04-security.md §5.1, §5.3) attach in P2, once
 * identity exists — the shape of the key is what makes that a one-line change.
 */

export type RateLimitResult = {
	allowed: boolean;
	remaining: number;
	/** When the current window ends, for a Retry-After header. */
	resetAt: number;
};

export function checkRateLimit(
	db: Db,
	clock: Clock,
	{ key, limit, windowMs }: { key: string; limit: number; windowMs: number }
): RateLimitResult {
	const now = clock.now();
	const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

	return db.transaction((tx) => {
		tx.insert(rateLimitBucket)
			.values({ key, windowStart, count: 1 })
			.onConflictDoUpdate({
				target: [rateLimitBucket.key, rateLimitBucket.windowStart],
				set: { count: sql`${rateLimitBucket.count} + 1` }
			})
			.run();

		const row = tx
			.select()
			.from(rateLimitBucket)
			.where(and(eq(rateLimitBucket.key, key), eq(rateLimitBucket.windowStart, windowStart)))
			.get();

		const count = row?.count ?? 1;
		return {
			allowed: count <= limit,
			remaining: Math.max(0, limit - count),
			resetAt: windowStart.getTime() + windowMs
		};
	});
}

/** Housekeeping: drop windows that can no longer be consulted. */
export function pruneRateLimits(db: Db, clock: Clock, olderThanMs: number): void {
	db.delete(rateLimitBucket)
		.where(gte(sql`${clock.now()} - ${rateLimitBucket.windowStart}`, olderThanMs))
		.run();
}

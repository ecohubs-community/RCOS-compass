import { pruneRateLimits } from '../rate-limit.js';
import { enqueue } from './queue.js';
import type { HandlerRegistry } from './worker.js';

/** How often the housekeeping job re-arms itself. */
export const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60_000;

/**
 * Every job kind the instance knows how to run.
 *
 * Handlers must be idempotent — delivery is at-least-once (docs/00-architecture.md
 * §6). `prune-rate-limits` is the first one because it is genuinely needed and
 * safely repeatable: deleting an already-deleted window is a no-op.
 */
export const handlers: HandlerRegistry = {
	/**
	 * Housekeeping. Re-arms itself, because a job enqueued once at boot cleans up
	 * exactly once: an instance that stays up for weeks would accumulate a
	 * rate-limit row per key and window forever, growing the database and slowing
	 * the lookup that runs on every request.
	 */
	'prune-rate-limits': {
		timeoutMs: 10_000,
		run: (_payload, { db, clock }) => {
			pruneRateLimits(db, clock, RATE_LIMIT_RETENTION_MS);
			enqueue(db, clock, {
				kind: 'prune-rate-limits',
				runAfter: clock.now() + PRUNE_INTERVAL_MS
			});
		}
	}
};

export const JOB_KINDS = Object.keys(handlers);

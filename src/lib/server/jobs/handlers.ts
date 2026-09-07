import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import { pruneRateLimits } from '../rate-limit.js';
import { runExtraction } from '../documents/extract-job.js';
import { purgeDeletedCommunities } from './purge.js';
import { sendWeeklyDigests } from './digest.js';
import { expireExceptions } from '../services/visibility.js';
import { enqueue } from './queue.js';
import type { HandlerRegistry } from './worker.js';

/** How often the housekeeping job re-arms itself. */
export const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;
/** Daily is often enough for something with a thirty-day grace period. */
export const PURGE_INTERVAL_MS = 24 * 60 * 60_000;
/** Weekly, and re-armed by the handler rather than by a scheduler. */
export const DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60_000;
/**
 * Hourly, which is a great deal more often than an exception's granularity
 * needs — they are set in days. The reason is the direction of the error: a
 * restriction that outlives its stated end by an hour is a small broken
 * promise, and one that outlives it by a day because the instance restarted at
 * the wrong moment is the failure the expiry exists to prevent.
 */
export const EXCEPTION_INTERVAL_MS = 60 * 60_000;
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
	},

	/**
	 * Document extraction. The handler enforces its own reading deadline and
	 * writes every outcome — including failure — onto the document row, so the
	 * job completing is not the same thing as the extraction succeeding. This
	 * outer timeout is only the backstop for the process-death case.
	 */
	'extract-document': {
		timeoutMs: 180_000,
		run: async (payload, { db, clock }) => {
			const { documentId } = payload as { documentId?: string };
			if (typeof documentId === 'string') await runExtraction(db, clock, documentId);
		}
	},

	/**
	 * Hard deletion after the grace period, including the upload directory —
	 * the part no database cascade can do. Re-arms itself like the others.
	 */
	'purge-communities': {
		timeoutMs: 120_000,
		run: async (_payload, { db, clock }) => {
			const result = await purgeDeletedCommunities(db, clock);
			if (result.purged > 0 || result.orphansRemoved > 0) {
				getLogger().info(result, 'purged deleted communities');
			}
			enqueue(db, clock, { kind: 'purge-communities', runAfter: clock.now() + PURGE_INTERVAL_MS });
		}
	},

	/**
	 * The weekly digest. Re-arms itself the way the pruner does, so an instance
	 * that stays up keeps sending rather than sending once at boot.
	 */
	'weekly-digest': {
		timeoutMs: 120_000,
		run: async (_payload, { db, clock }) => {
			const result = await sendWeeklyDigests(db, clock, getConfig().PUBLIC_APP_URL);
			getLogger().info(result, 'weekly digest');
			enqueue(db, clock, { kind: 'weekly-digest', runAfter: clock.now() + DIGEST_INTERVAL_MS });
		}
	},

	/**
	 * Ending transparency exceptions that have run out.
	 *
	 * The first scheduled job that changes a subject's state rather than tidying
	 * up after one. RCOS §5.3.5 requires exceptions to be time-bounded, and a
	 * bound nothing enforces is a sentence in a settings screen — so the job is
	 * the enforcement, and every reversion lands in the community's change log
	 * rather than happening quietly.
	 *
	 * Idempotent by the same trick as the others: it selects only what is still
	 * live and past its date, so a second run in the same hour finds nothing.
	 */
	'expire-exceptions': {
		timeoutMs: 30_000,
		run: (_payload, { db, clock }) => {
			const result = expireExceptions(db, clock.now());
			if (result.expired > 0) getLogger().info(result, 'transparency exceptions expired');
			enqueue(db, clock, {
				kind: 'expire-exceptions',
				runAfter: clock.now() + EXCEPTION_INTERVAL_MS
			});
		}
	}
};

export const JOB_KINDS = Object.keys(handlers);

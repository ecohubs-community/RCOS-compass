import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import { sweepErrors } from '../services/errors.js';
import { pruneRateLimits } from '../rate-limit.js';
import { runExtraction } from '../documents/extract-job.js';
import { rereadBehindDocuments } from '../documents/reread.js';
import { runScanJob } from './scan-job.js';
import type { ScanPayload } from '../services/mapping.js';
import { purgeDeletedCommunities } from './purge.js';
import { sendWeeklyDigests } from './digest.js';
import { expireExceptions } from '../services/visibility.js';
import { cleanUpExports, runExport, type ExportPayload } from './export-job.js';
import { runMirror, type MirrorPayload } from './mirror-job.js';
import { runNotificationMail, type NotificationMailPayload } from './notification-mail.js';
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
/** Daily: a bundle lives a week, so an hour of slack either side is immaterial. */
export const EXPORT_CLEANUP_MS = 24 * 60 * 60_000;

/** Daily, like the export cleanup: the records it removes are a month old. */
export const ERROR_SWEEP_MS = 24 * 60 * 60_000;
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
	 * One batch of a member-started document scan. Chains itself: a long
	 * document is many short jobs, never one that holds the queue. The step
	 * records every ending on the document itself, so nothing here throws.
	 */
	'document.scan': {
		timeoutMs: 180_000,
		run: async (payload, { db, clock }) => {
			await runScanJob(db, clock, payload as ScanPayload);
		}
	},

	/**
	 * The one-off sweep behind `document-paragraphs`: documents read by an
	 * older reader are handed back to extraction. Enqueued at boot only when
	 * something is actually behind (`enqueueRereadIfNeeded`), and not re-armed.
	 */
	'reread-documents': {
		timeoutMs: 60_000,
		run: (_payload, { db, clock }) => {
			const result = rereadBehindDocuments(db, clock);
			if (result.rereading > 0)
				getLogger().info(result, 're-reading documents with the current reader');
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
	/**
	 * Building an export bundle. Enqueued by a steward asking for one, and not
	 * re-armed: it is work somebody requested rather than housekeeping.
	 */
	'notification-mail': {
		timeoutMs: 60_000,
		run: async (payload, { db, clock }) => {
			await runNotificationMail(
				db,
				clock,
				payload as NotificationMailPayload,
				getConfig().PUBLIC_APP_URL
			);
		}
	},

	'build-export': {
		timeoutMs: 120_000,
		run: async (payload, { db, clock }) => {
			await runExport(db, payload as ExportPayload, clock.now());
		}
	},

	/** Removing bundles past their date, and the rows that point at them. */
	'clean-exports': {
		timeoutMs: 60_000,
		run: async (_payload, { db, clock }) => {
			const result = await cleanUpExports(db, clock.now());
			if (result.removed > 0) getLogger().info(result, 'expired exports removed');
			enqueue(db, clock, { kind: 'clean-exports', runAfter: clock.now() + EXPORT_CLEANUP_MS });
		}
	},

	/**
	 * Removing error and mail-failure records past their retention.
	 *
	 * Operational records rather than governance: nobody needs to know that a
	 * route was throwing six weeks ago, and a table that only grows becomes a
	 * liability made of things nobody reads.
	 */
	'sweep-errors': {
		timeoutMs: 30_000,
		run: (_payload, { db, clock }) => {
			const result = sweepErrors(db, clock.now());
			if (result.removed > 0) getLogger().info(result, 'expired error records removed');
			enqueue(db, clock, { kind: 'sweep-errors', runAfter: clock.now() + ERROR_SWEEP_MS });
			return Promise.resolve();
		}
	},

	/**
	 * Mirroring a community's state after a freeze. Retried with backoff by the
	 * queue like any other job, because a remote that is briefly unreachable is
	 * the ordinary case rather than an error.
	 */
	'mirror-commit': {
		timeoutMs: 120_000,
		run: async (payload, { db, clock }) => {
			await runMirror(db, payload as MirrorPayload, clock.now());
		}
	},

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

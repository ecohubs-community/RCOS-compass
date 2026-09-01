import { pruneRateLimits } from '../rate-limit.js';
import { systemClock } from '../clock.js';
import type { HandlerRegistry } from './worker.js';

/**
 * Every job kind the instance knows how to run.
 *
 * Handlers must be idempotent — delivery is at-least-once (docs/00-architecture.md
 * §6). `prune-rate-limits` is the first one because it is genuinely needed and
 * safely repeatable: deleting an already-deleted window is a no-op.
 */
export const handlers: HandlerRegistry = {
	'prune-rate-limits': {
		timeoutMs: 10_000,
		run: (_payload, { db }) => {
			pruneRateLimits(db, systemClock, 24 * 60 * 60_000);
		}
	}
};

export const JOB_KINDS = Object.keys(handlers);

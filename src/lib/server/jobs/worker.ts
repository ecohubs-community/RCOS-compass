import { systemClock, type Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import type { Job } from '../db/schema/jobs.js';
import { claim, complete, fail, DEFAULT_VISIBILITY_MS } from './queue.js';

/**
 * The in-process worker. docs/00-architecture.md §6.
 *
 * Handlers MUST be idempotent: delivery is at-least-once, and a job whose claim
 * expires runs again.
 */
export type JobHandler = {
	/** Wall-clock limit. Exceeding it abandons the run and retries it. */
	timeoutMs?: number;
	/**
	 * The clock is passed in rather than reached for: a handler that schedules
	 * follow-up work must use the same time source as the queue, or a test that
	 * freezes time gets a job scheduled against the wall clock.
	 * docs/06-testing-strategy.md §2.1.
	 */
	run: (payload: unknown, ctx: { job: Job; db: Db; clock: Clock }) => Promise<void> | void;
};

export type HandlerRegistry = Record<string, JobHandler>;

export class JobTimeoutError extends Error {
	constructor(kind: string, ms: number) {
		super(`Job handler "${kind}" exceeded its ${ms}ms limit`);
		this.name = 'JobTimeoutError';
	}
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function withTimeout(promise: Promise<void>, ms: number, kind: string): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new JobTimeoutError(kind, ms)), ms);
			})
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export type RunResult = { ran: number; failed: number; dead: number };

/**
 * Claim and run one batch. Exposed separately from {@link startWorker} so tests
 * drive it directly rather than waiting on a poll interval.
 */
export async function runOnce(
	db: Db,
	handlers: HandlerRegistry,
	{ clock = systemClock, batchSize = 5, visibilityMs = DEFAULT_VISIBILITY_MS } = {}
): Promise<RunResult> {
	const claimed = claim(db, clock, { limit: batchSize, visibilityMs });
	const result: RunResult = { ran: 0, failed: 0, dead: 0 };

	for (const item of claimed) {
		const handler = handlers[item.kind];
		if (!handler) {
			// An unknown kind is a deploy problem, not a data problem. Fail it so it
			// backs off and is visible, rather than looping hot.
			if (fail(db, clock, item.id, `No handler registered for job kind "${item.kind}"`) === 'dead')
				result.dead += 1;
			result.failed += 1;
			continue;
		}

		try {
			await withTimeout(
				Promise.resolve(handler.run(item.payload, { job: item, db, clock })),
				handler.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				item.kind
			);
			complete(db, clock, item.id);
			result.ran += 1;
		} catch (error) {
			if (fail(db, clock, item.id, error) === 'dead') result.dead += 1;
			result.failed += 1;
		}
	}

	return result;
}

export type Worker = { stop: () => Promise<void> };

/**
 * Start polling. Stops cleanly: `stop()` waits for the batch in flight, so a
 * shutdown does not orphan a claim that must then time out.
 */
export function startWorker(
	db: Db,
	handlers: HandlerRegistry,
	{ clock = systemClock, intervalMs = 1_000, batchSize = 5 } = {}
): Worker {
	let stopped = false;
	let running: Promise<void> | null = null;

	/**
	 * Self-scheduling rather than `setInterval`.
	 *
	 * A fixed interval fires whether or not the previous batch finished, so one
	 * handler slower than the interval stacks batches on top of each other — with
	 * a 120s extraction timeout and a 5s interval that is two dozen overlapping
	 * runs, each claiming another batch. Waiting for the batch to finish before
	 * scheduling the next keeps concurrency at one batch, which is what a
	 * single-instance worker should be.
	 */
	const loop = async (): Promise<void> => {
		while (!stopped) {
			try {
				await runOnce(db, handlers, { clock, batchSize });
			} catch {
				// runOnce already records per-job failures; a throw here is the queue
				// itself failing, and the next pass will retry.
			}
			if (stopped) break;
			await new Promise<void>((resolve) => {
				const timer = setTimeout(resolve, intervalMs);
				// Never hold the process open just to poll.
				if (typeof timer.unref === 'function') timer.unref();
			});
		}
	};

	running = loop();

	return {
		stop: async () => {
			stopped = true;
			await running;
		}
	};
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { and, eq } from 'drizzle-orm';
import { job } from '../../src/lib/server/db/schema/jobs.js';
import { enqueue, findJob } from '../../src/lib/server/jobs/queue.js';
import { handlers, PRUNE_INTERVAL_MS } from '../../src/lib/server/jobs/handlers.js';
import { runOnce, startWorker } from '../../src/lib/server/jobs/worker.js';
import { checkRateLimit } from '../../src/lib/server/rate-limit.js';
import { createTestDb } from '../support/db.js';

const START = Date.UTC(2026, 8, 1, 12, 0, 0);
let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	clock = fixedClock(START);
});
afterEach(() => cleanup());

describe('the registered handlers', () => {
	it('runs prune-rate-limits end to end', async () => {
		checkRateLimit(db, clock, { key: 'login:ip:203.0.113.4', limit: 5, windowMs: 60_000 });

		// A day later the window is beyond any use.
		clock.advance(25 * 60 * 60_000);
		const queued = enqueue(db, clock, { kind: 'prune-rate-limits' });
		const result = await runOnce(db, handlers, { clock });

		expect(result).toEqual({ ran: 1, failed: 0, dead: 0 });
		expect(findJob(db, queued.id)?.status).toBe('done');
	});

	it('is idempotent, as every handler must be', async () => {
		enqueue(db, clock, { kind: 'prune-rate-limits' });
		await runOnce(db, handlers, { clock });
		enqueue(db, clock, { kind: 'prune-rate-limits' });
		await expect(runOnce(db, handlers, { clock })).resolves.toMatchObject({ failed: 0 });
	});
});

describe('the polling worker', () => {
	it('picks work up on its own and stops cleanly', async () => {
		let ran = 0;
		const queued = enqueue(db, clock, { kind: 'tick' });
		const worker = startWorker(
			db,
			{ tick: { run: () => void (ran += 1) } },
			{ clock, intervalMs: 10 }
		);

		await new Promise((resolve) => setTimeout(resolve, 120));
		await worker.stop();

		expect(ran).toBeGreaterThanOrEqual(1);
		expect(findJob(db, queued.id)?.status).toBe('done');

		// After stopping, nothing more is claimed.
		const before = ran;
		enqueue(db, clock, { kind: 'tick' });
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(ran).toBe(before);
	});
});

describe('housekeeping re-arms itself', () => {
	it('enqueues the next prune so cleanup does not stop after boot', async () => {
		enqueue(db, clock, { kind: 'prune-rate-limits' });
		await runOnce(db, handlers, { clock });

		// A job enqueued once at boot would clean up exactly once; an instance up
		// for weeks would then grow a rate-limit row per key and window forever.
		const pending = db
			.select()
			.from(job)
			.where(and(eq(job.kind, 'prune-rate-limits'), eq(job.status, 'pending')))
			.all();
		expect(pending).toHaveLength(1);
		expect(pending[0]!.runAfter.getTime()).toBe(START + PRUNE_INTERVAL_MS);
	});
});

describe('the worker does not overlap batches', () => {
	it('waits for a slow batch before starting the next', async () => {
		let concurrent = 0;
		let peak = 0;
		enqueue(db, clock, { kind: 'slow' });
		enqueue(db, clock, { kind: 'slow' });

		const worker = startWorker(
			db,
			{
				slow: {
					run: async () => {
						concurrent += 1;
						peak = Math.max(peak, concurrent);
						await new Promise((resolve) => setTimeout(resolve, 40));
						concurrent -= 1;
					}
				}
			},
			{ clock, intervalMs: 5, batchSize: 1 }
		);

		await new Promise((resolve) => setTimeout(resolve, 200));
		await worker.stop();

		// With setInterval, a 40ms handler and a 5ms tick would stack batches.
		expect(peak).toBe(1);
	});

	it('stop() waits for the batch in flight', async () => {
		let finished = false;
		enqueue(db, clock, { kind: 'slow' });
		const worker = startWorker(
			db,
			{
				slow: {
					run: async () => {
						await new Promise((resolve) => setTimeout(resolve, 60));
						finished = true;
					}
				}
			},
			{ clock, intervalMs: 5 }
		);

		await new Promise((resolve) => setTimeout(resolve, 20));
		await worker.stop();
		expect(finished).toBe(true);
	});
});

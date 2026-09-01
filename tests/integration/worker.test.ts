import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { enqueue, findJob } from '../../src/lib/server/jobs/queue.js';
import { handlers } from '../../src/lib/server/jobs/handlers.js';
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

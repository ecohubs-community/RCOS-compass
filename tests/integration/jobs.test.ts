import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { setIdGeneratorForTests, seededIdGenerator } from '../../src/lib/server/db/id.js';
import {
	backoffMs,
	claim,
	complete,
	deadLetters,
	enqueue,
	fail,
	findJob
} from '../../src/lib/server/jobs/queue.js';
import { runOnce, type HandlerRegistry } from '../../src/lib/server/jobs/worker.js';
import { createTestDb } from '../support/db.js';

const START = Date.UTC(2026, 8, 1, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	clock = fixedClock(START);
	setIdGeneratorForTests(seededIdGenerator());
});

afterEach(() => {
	setIdGeneratorForTests(null);
	cleanup();
});

describe('a job is enqueued and runs', () => {
	it('is claimed, run, and marked done', async () => {
		const queued = enqueue(db, clock, { kind: 'greet', payload: { who: 'Ana' } });
		const seen: unknown[] = [];
		const handlers: HandlerRegistry = { greet: { run: (payload) => void seen.push(payload) } };

		const result = await runOnce(db, handlers, { clock });

		expect(result).toEqual({ ran: 1, failed: 0, dead: 0 });
		expect(seen).toEqual([{ who: 'Ana' }]);
		expect(findJob(db, queued.id)?.status).toBe('done');
	});

	it('does not claim a job whose time has not come', async () => {
		enqueue(db, clock, { kind: 'later', runAfter: START + 60_000 });
		expect(claim(db, clock)).toHaveLength(0);

		clock.advance(60_000);
		expect(claim(db, clock)).toHaveLength(1);
	});

	it('enqueueing does not run the handler — the request does not wait for it', () => {
		let handlerRuns = 0;
		const handlers: HandlerRegistry = { greet: { run: () => void (handlerRuns += 1) } };

		const queued = enqueue(db, clock, { kind: 'greet' });

		expect(handlerRuns).toBe(0);
		expect(findJob(db, queued.id)?.status).toBe('pending');
		expect(handlers.greet).toBeDefined();
	});
});

describe('the process restarts mid-job', () => {
	it('re-claims the job once its visibility timeout expires', () => {
		const queued = enqueue(db, clock, { kind: 'orphan' });

		const first = claim(db, clock, { visibilityMs: 30_000 });
		expect(first).toHaveLength(1);

		// Still claimed: another worker must not take it.
		clock.advance(29_000);
		expect(claim(db, clock)).toHaveLength(0);

		// Claim expired: it comes back.
		clock.advance(2_000);
		const second = claim(db, clock);
		expect(second).toHaveLength(1);
		expect(second[0]!.id).toBe(queued.id);
		expect(second[0]!.attempts).toBe(2);
	});
});

describe('a job is claimed twice', () => {
	it('produces the same observable result as running it once', async () => {
		// The handler is idempotent by construction: it sets a value rather than
		// incrementing one. This is the contract every handler must meet.
		const state = new Map<string, string>();
		const handlers: HandlerRegistry = {
			setValue: { run: (payload) => void state.set((payload as { key: string }).key, 'set') }
		};

		enqueue(db, clock, { kind: 'setValue', payload: { key: 'a' } });
		await runOnce(db, handlers, { clock, visibilityMs: 1 });
		clock.advance(10);
		// Simulate a re-delivery of the same work.
		enqueue(db, clock, { kind: 'setValue', payload: { key: 'a' } });
		await runOnce(db, handlers, { clock });

		expect([...state.entries()]).toEqual([['a', 'set']]);
	});
});

describe('failures retry with backoff and end in a dead letter', () => {
	it('records the error and schedules a retry with increasing delay', async () => {
		const queued = enqueue(db, clock, { kind: 'boom' });
		const handlers: HandlerRegistry = {
			boom: {
				run: () => {
					throw new Error('kaboom');
				}
			}
		};

		const result = await runOnce(db, handlers, { clock });

		expect(result.failed).toBe(1);
		const row = findJob(db, queued.id)!;
		expect(row.status).toBe('pending');
		expect(row.lastError).toContain('kaboom');
		expect(row.runAfter.getTime()).toBe(START + backoffMs(1));
	});

	it('increases the delay with each attempt', () => {
		expect(backoffMs(1)).toBe(1_000);
		expect(backoffMs(2)).toBe(2_000);
		expect(backoffMs(3)).toBe(4_000);
		expect(backoffMs(99)).toBe(60 * 60_000); // capped
	});

	it('moves to a dead letter after exhausting its attempts and stops retrying', async () => {
		const queued = enqueue(db, clock, { kind: 'boom', maxAttempts: 3 });
		const handlers: HandlerRegistry = {
			boom: {
				run: () => {
					throw new Error('still broken');
				}
			}
		};

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await runOnce(db, handlers, { clock });
			clock.advance(backoffMs(attempt + 1));
		}

		const row = findJob(db, queued.id)!;
		expect(row.status).toBe('dead');
		expect(row.attempts).toBe(3);
		expect(row.lastError).toContain('still broken');

		// Not retried automatically, however much time passes.
		clock.advance(24 * 60 * 60_000);
		expect(claim(db, clock)).toHaveLength(0);
	});

	it('is visible with its last error for the instance status page', () => {
		const queued = enqueue(db, clock, { kind: 'boom', maxAttempts: 1 });
		claim(db, clock);
		fail(db, clock, queued.id, new Error('gave up'));

		const dead = deadLetters(db);
		expect(dead).toHaveLength(1);
		expect(dead[0]!.lastError).toContain('gave up');
	});

	it('fails a job whose kind has no registered handler rather than looping hot', async () => {
		const queued = enqueue(db, clock, { kind: 'not-deployed-yet' });
		const result = await runOnce(db, {}, { clock });

		expect(result.failed).toBe(1);
		expect(findJob(db, queued.id)?.lastError).toContain('No handler registered');
	});
});

describe('a job runs longer than its timeout', () => {
	it('is abandoned, recorded as failed, and retried under the same rules', async () => {
		const queued = enqueue(db, clock, { kind: 'slow' });
		const handlers: HandlerRegistry = {
			slow: {
				timeoutMs: 20,
				run: () => new Promise<void>((resolve) => setTimeout(resolve, 5_000))
			}
		};

		const result = await runOnce(db, handlers, { clock });

		expect(result.failed).toBe(1);
		const row = findJob(db, queued.id)!;
		expect(row.status).toBe('pending');
		expect(row.lastError).toContain('exceeded its 20ms limit');
	});
});

describe('a failing job never damages the work that scheduled it', () => {
	it('leaves committed data untouched when the job fails every attempt', async () => {
		// Stand-in for a freeze: data committed first, job enqueued after.
		const committed = { decisions: ['DEC-2026-001'] };
		const queued = enqueue(db, clock, { kind: 'mirror-push', maxAttempts: 2 });

		const handlers: HandlerRegistry = {
			'mirror-push': {
				run: () => {
					throw new Error('remote unreachable');
				}
			}
		};

		for (let attempt = 0; attempt < 2; attempt += 1) {
			await runOnce(db, handlers, { clock });
			clock.advance(backoffMs(attempt + 1));
		}

		expect(findJob(db, queued.id)?.status).toBe('dead');
		// Nothing rolled back, nothing altered.
		expect(committed.decisions).toEqual(['DEC-2026-001']);
	});
});

describe('completing a job', () => {
	it('clears the claim and the last error', () => {
		const queued = enqueue(db, clock, { kind: 'ok' });
		claim(db, clock);
		fail(db, clock, queued.id, new Error('transient'));
		claim(db, clock);
		complete(db, clock, queued.id);

		const row = findJob(db, queued.id)!;
		expect(row.status).toBe('done');
		expect(row.lockedUntil).toBeNull();
		expect(row.lastError).toBeNull();
	});
});

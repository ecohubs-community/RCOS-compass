import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
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

const limit = { key: 'login:ip:203.0.113.4', limit: 3, windowMs: 60_000 };

describe('rate limiting', () => {
	it('allows requests up to the limit and refuses the next one', () => {
		expect(checkRateLimit(db, clock, limit).allowed).toBe(true);
		expect(checkRateLimit(db, clock, limit).allowed).toBe(true);
		expect(checkRateLimit(db, clock, limit).allowed).toBe(true);

		const refused = checkRateLimit(db, clock, limit);
		expect(refused.allowed).toBe(false);
		expect(refused.remaining).toBe(0);
	});

	it('counts each key separately', () => {
		for (let i = 0; i < 4; i += 1) checkRateLimit(db, clock, limit);
		expect(checkRateLimit(db, clock, { ...limit, key: 'login:ip:198.51.100.7' }).allowed).toBe(
			true
		);
	});

	it('lets the window roll over', () => {
		for (let i = 0; i < 4; i += 1) checkRateLimit(db, clock, limit);
		expect(checkRateLimit(db, clock, limit).allowed).toBe(false);

		clock.advance(60_000);
		expect(checkRateLimit(db, clock, limit).allowed).toBe(true);
	});

	it('reports when the window resets, for a Retry-After header', () => {
		const result = checkRateLimit(db, clock, limit);
		expect(result.resetAt).toBe(START + 60_000);
	});
});

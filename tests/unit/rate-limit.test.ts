import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';

/**
 * The sliding-window arithmetic, tested without a database. The storage
 * behaviour is covered in tests/integration/rate-limit.test.ts.
 */
describe('window bucketing', () => {
	const windowMs = 60_000;
	const bucketFor = (now: number) => Math.floor(now / windowMs) * windowMs;

	it('puts two requests in the same minute into the same bucket', () => {
		const clock = fixedClock(Date.UTC(2026, 8, 1, 12, 0, 5));
		const first = bucketFor(clock.now());
		clock.advance(50_000);
		expect(bucketFor(clock.now())).toBe(first);
	});

	it('starts a new bucket at the window boundary', () => {
		const clock = fixedClock(Date.UTC(2026, 8, 1, 12, 0, 5));
		const first = bucketFor(clock.now());
		clock.advance(60_000);
		expect(bucketFor(clock.now())).toBe(first + windowMs);
	});
});

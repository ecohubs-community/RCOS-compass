import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import {
	isExemptFromRateLimit,
	rateLimitRequest
} from '../../src/lib/server/http/rate-limit-request.js';
import { createTestDb } from '../support/db.js';

/**
 * The wiring, not the arithmetic — that is tested in rate-limit.test.ts. This
 * exists because the limiter was implemented and then not called by anything for
 * a while: the mechanism passing its own tests said nothing about whether a
 * request was ever actually refused.
 */
const START = Date.UTC(2026, 8, 2, 12, 0, 0);
let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	clock = fixedClock(START);
});
afterEach(() => cleanup());

const request = (pathname = '/c/valle-verde', clientAddress = '203.0.113.4') =>
	rateLimitRequest({ db, clock, pathname, clientAddress, limit: 3, requestId: 'req-1' });

describe('rate limiting a request', () => {
	it('lets requests through up to the ceiling', () => {
		expect(request()).toBeNull();
		expect(request()).toBeNull();
		expect(request()).toBeNull();
	});

	it('refuses the next one with 429 and a usable Retry-After', async () => {
		for (let i = 0; i < 3; i += 1) request();

		const refusal = request();
		expect(refusal).not.toBeNull();
		expect(refusal!.status).toBe(429);
		expect(Number(refusal!.headers.get('Retry-After'))).toBeGreaterThan(0);
		expect(refusal!.headers.get('X-Request-Id')).toBe('req-1');
		expect(await refusal!.text()).not.toContain('203.0.113.4');
	});

	it('counts each client separately', () => {
		for (let i = 0; i < 4; i += 1) request('/c/valle-verde', '203.0.113.4');
		expect(request('/c/valle-verde', '198.51.100.7')).toBeNull();
	});

	it('lets the window roll over', () => {
		for (let i = 0; i < 4; i += 1) request();
		expect(request()).not.toBeNull();

		clock.advance(60_000);
		expect(request()).toBeNull();
	});
});

describe('exemptions', () => {
	it('never rate limits the health probe — a container must not lock itself out', () => {
		for (let i = 0; i < 20; i += 1) {
			expect(request('/healthz'), `attempt ${i}`).toBeNull();
		}
	});

	it('never rate limits built assets, so one page load cannot exhaust a budget', () => {
		for (let i = 0; i < 20; i += 1) {
			expect(request('/_app/immutable/chunks/abc.js'), `attempt ${i}`).toBeNull();
		}
	});

	it('does rate limit everything else', () => {
		expect(isExemptFromRateLimit('/c/valle-verde/definitions')).toBe(false);
		expect(isExemptFromRateLimit('/')).toBe(false);
		expect(isExemptFromRateLimit('/healthz')).toBe(true);
		expect(isExemptFromRateLimit('/_app/version.json')).toBe(true);
	});
});

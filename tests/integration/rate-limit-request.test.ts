import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import {
	isAdminAction,
	isCredentialAttempt,
	isExemptFromRateLimit,
	rateLimitRequest
} from '../../src/lib/server/http/rate-limit-request.js';
import { listAudit } from '../../src/lib/server/services/audit.js';
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

const request = (
	pathname = '/c/valle-verde',
	clientAddress = '203.0.113.4',
	extra: { method?: string; userId?: string | null; limit?: number } = {}
) =>
	rateLimitRequest({
		db,
		clock,
		pathname,
		method: extra.method ?? 'GET',
		clientAddress,
		userId: extra.userId ?? null,
		limit: extra.limit ?? 3,
		authLimit: 2,
		requestId: 'req-1'
	});

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

describe('one account cannot spend another\u2019s budget', () => {
	it('counts signed-in members separately behind one address', () => {
		// The normal case here, not an edge one: a co-housing project on a single
		// connection is one IP and thirty people.
		for (let i = 0; i < 4; i += 1) request('/c/valle-verde', '203.0.113.4', { userId: 'ana' });
		// Ana is over her own ceiling.
		expect(request('/c/valle-verde', '203.0.113.4', { userId: 'ana' })).not.toBeNull();
	});

	it('still holds a single account to the ceiling across addresses', () => {
		for (let i = 0; i < 4; i += 1)
			request('/c/valle-verde', `198.51.100.${i}`, { userId: 'marco' });
		expect(request('/c/valle-verde', '198.51.100.9', { userId: 'marco' })).not.toBeNull();
	});
});

describe('credential attempts have their own, tighter ceiling', () => {
	it('refuses a third sign-in POST while a third page view is still fine', () => {
		expect(request('/sign-in', '203.0.113.4', { method: 'POST' })).toBeNull();
		expect(request('/sign-in', '203.0.113.4', { method: 'POST' })).toBeNull();
		// authLimit is 2 and the general limit is 3: this is refused by the auth
		// bucket, which is the whole point of having a second one.
		expect(request('/sign-in', '203.0.113.4', { method: 'POST' })).not.toBeNull();
	});

	it('leaves rendering the sign-in page alone', () => {
		for (let i = 0; i < 3; i += 1) {
			expect(request('/sign-in', '198.51.100.20', { method: 'GET' }), `view ${i}`).toBeNull();
		}
	});

	it('records the refusal, so a burst is visible afterwards', () => {
		for (let i = 0; i < 3; i += 1) request('/sign-in', '203.0.113.9', { method: 'POST' });

		const events = listAudit({ action: 'auth.signin.rate_limited' }, db);
		expect(events).toHaveLength(1);
		expect(events[0]!.ip).toBe('203.0.113.9');
	});

	it('covers the challenge and enrolment, not only the password', () => {
		expect(isCredentialAttempt('/sign-in/two-factor', 'POST')).toBe(true);
		expect(isCredentialAttempt('/account/two-factor', 'POST')).toBe(true);
		expect(isCredentialAttempt('/api/auth/sign-in/email', 'POST')).toBe(true);
		expect(isCredentialAttempt('/c/valle-verde/definitions', 'POST')).toBe(false);
		// Not a prefix match on a path that merely starts with the same letters.
		expect(isCredentialAttempt('/sign-in-help', 'POST')).toBe(false);
	});
});

describe('administrative writes have their own hourly ceiling', () => {
	it('lets an operator work and stops a stolen session emptying the instance', () => {
		// docs/05-admin-console.md §5.6: sixty an hour. Far more than anyone does
		// by hand, far less than suspending every community on the box needs.
		// The general ceiling is raised out of the way so the hourly admin bucket
		// is the only thing this measures.
		const action = () =>
			request('/admin/communities/x', '203.0.113.4', {
				method: 'POST',
				userId: 'ops',
				limit: 10_000
			});

		for (let i = 0; i < 60; i += 1) {
			expect(action(), `action ${i}`).toBeNull();
		}

		expect(action()).not.toBeNull();
	});

	it('leaves reading the console alone', () => {
		expect(isAdminAction('/admin/communities', 'GET')).toBe(false);
		expect(isAdminAction('/admin/communities', 'POST')).toBe(true);
		expect(isAdminAction('/admin', 'POST')).toBe(true);
		// Not a prefix match on a path that merely begins with the same letters.
		expect(isAdminAction('/administration', 'POST')).toBe(false);
	});
});

import { describe, expect, it, vi } from 'vitest';
import { applyAuthCookies, parseSetCookie } from '../../src/lib/server/auth/cookies.js';

/**
 * The bridge from better-auth's `Set-Cookie` headers to SvelteKit's cookie jar.
 *
 * Worth its own suite because everything about a session depends on it and none
 * of it is visible: a cookie re-issued with the wrong path, or re-encoded, fails
 * by silently not signing anyone in.
 */
describe('parsing one Set-Cookie header', () => {
	it('reads the name, the value and the attributes that matter', () => {
		const parsed = parseSetCookie(
			'compass.session_token=abc.def; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000'
		);

		expect(parsed).toEqual({
			name: 'compass.session_token',
			value: 'abc.def',
			options: {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 2_592_000
			}
		});
	});

	it('defaults an absent path to the root the library actually uses', () => {
		expect(parseSetCookie('compass.two_factor=xyz; HttpOnly')?.options.path).toBe('/');
	});

	it('keeps a value containing an equals sign intact', () => {
		// Base64 padding is the common case, and splitting on every `=` eats it.
		expect(parseSetCookie('t=YWJj==; Path=/')?.value).toBe('YWJj==');
	});

	it('reads an expiry given as a date', () => {
		const parsed = parseSetCookie('t=1; Path=/; Expires=Thu, 01 Jan 2026 00:00:00 GMT');
		expect(parsed?.options.expires?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
	});

	it('ignores attributes it does not model rather than guessing', () => {
		const parsed = parseSetCookie('t=1; Path=/; Partitioned; Priority=High');
		expect(parsed?.options).toEqual({ path: '/' });
	});

	it('returns nothing for a header with no name', () => {
		expect(parseSetCookie('=value; Path=/')).toBeNull();
		expect(parseSetCookie('nonsense')).toBeNull();
	});
});

describe('re-issuing them through SvelteKit', () => {
	function jar() {
		return { set: vi.fn(), get: vi.fn(), getAll: vi.fn(), delete: vi.fn(), serialize: vi.fn() };
	}

	it('sets every cookie the response carried', () => {
		const cookies = jar();
		const response = new Response(null, {
			headers: [
				['set-cookie', 'compass.session_token=abc; Path=/; HttpOnly'],
				['set-cookie', 'compass.two_factor=; Path=/; Max-Age=0']
			]
		});

		applyAuthCookies(response, cookies as never);

		expect(cookies.set).toHaveBeenCalledTimes(2);
		expect(cookies.set.mock.calls[0]![0]).toBe('compass.session_token');
		expect(cookies.set.mock.calls[1]![0]).toBe('compass.two_factor');
	});

	it('re-issues the value verbatim', () => {
		// SvelteKit percent-encodes by default. better-auth reads its own cookies
		// with its own parser, so a value encoded twice comes back decoded once and
		// no longer matches its signature — the session is silently lost.
		const cookies = jar();
		const signed = 'sessiontoken.c2lnbmF0dXJl%3D';
		applyAuthCookies(
			new Response(null, { headers: { 'set-cookie': `compass.session_token=${signed}; Path=/` } }),
			cookies as never
		);

		const [, value, options] = cookies.set.mock.calls[0]!;
		expect(value).toBe(signed);
		expect((options as { encode: (v: string) => string }).encode(signed)).toBe(signed);
	});
});

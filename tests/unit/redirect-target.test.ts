import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from '../../src/lib/server/http/redirect-target.js';

/**
 * `?redirectTo=` is attacker-controlled. An open redirect on a sign-in page is
 * worth more to a phisher than a fake one, because the page the victim types
 * their password into is genuinely ours.
 */
describe('where sign-in is allowed to send someone', () => {
	it('keeps a path on this site', () => {
		expect(safeRedirectTarget('/c/valle-verde/definitions')).toBe('/c/valle-verde/definitions');
		expect(safeRedirectTarget('/admin/communities?page=2')).toBe('/admin/communities?page=2');
	});

	it('falls back when there is nothing to go on', () => {
		expect(safeRedirectTarget(null)).toBe('/');
		expect(safeRedirectTarget('')).toBe('/');
		expect(safeRedirectTarget(undefined, '/account')).toBe('/account');
	});

	it.each([
		['https://evil.example/steal', 'an absolute URL'],
		['//evil.example/steal', 'a protocol-relative URL'],
		['/\\evil.example/steal', 'a backslash the browser reads as a slash'],
		['javascript:alert(1)', 'a scheme that is not http at all'],
		[' /c/valle-verde', 'a leading space, so the check sees a path and the parser does not'],
		['/\tc/valle-verde', 'an embedded control character']
	])('refuses %s (%s)', (target) => {
		expect(safeRedirectTarget(target)).toBe('/');
	});
});

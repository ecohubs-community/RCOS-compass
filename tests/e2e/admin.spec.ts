import { expect, test } from '@playwright/test';

/**
 * docs/05-admin-console.md §6. The console does not announce itself: an
 * unauthenticated request, an ordinary member, and a steward of every community
 * on the instance all get the same answer as someone asking for a page that does
 * not exist.
 *
 * The e2e server runs with ADMIN_EMAILS unset, so the whole route group is
 * absent — which is itself the first requirement.
 */
test.describe('the admin console', () => {
	const paths = ['/admin', '/admin/communities', '/admin/communities/some-id', '/admin/audit'];

	for (const path of paths) {
		test(`${path} is 404 for an unauthenticated request`, async ({ request }) => {
			expect((await request.get(path)).status()).toBe(404);
		});
	}

	test('does not hint at itself in the response body', async ({ request }) => {
		const body = await (await request.get('/admin/communities')).text();
		expect(body.toLowerCase()).not.toContain('administration');
		expect(body.toLowerCase()).not.toContain('two-factor');
	});
});

test.describe('tenant routes', () => {
	test('a community path is 404 when nobody is signed in', async ({ request }) => {
		// Not 401 or a sign-in redirect: whether this community exists is not
		// something an anonymous request gets to learn.
		expect((await request.get('/c/valle-verde')).status()).toBe(404);
	});

	test('an unknown community is the same 404', async ({ request }) => {
		const known = await request.get('/c/valle-verde');
		const unknown = await request.get('/c/no-such-community-at-all');
		expect(unknown.status()).toBe(known.status());
	});
});

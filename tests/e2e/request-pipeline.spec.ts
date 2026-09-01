import { expect, test } from '@playwright/test';

/**
 * The request-pipeline capability, asserted against a real production build.
 * Unit tests cover the header builder; these cover what actually reaches a
 * browser.
 */

test.describe('security headers', () => {
	test('every HTML response carries a nonce-based CSP and the hardening headers', async ({
		request
	}) => {
		const response = await request.get('/');
		expect(response.status()).toBe(200);

		const csp = response.headers()['content-security-policy'];
		expect(csp).toBeTruthy();
		expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
		// script-src is the one that matters: no inline, no eval. The single
		// unsafe-inline in the policy is style-src-attr — see svelte.config.js.
		const scriptSrc = /script-src ([^;]*)/.exec(csp ?? '')?.[1] ?? '';
		expect(scriptSrc).not.toContain('unsafe-inline');
		expect(scriptSrc).not.toContain('unsafe-eval');
		expect(csp).toContain("style-src 'self'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");

		expect(response.headers()['x-content-type-options']).toBe('nosniff');
		expect(response.headers()['referrer-policy']).toBe('same-origin');
		expect(response.headers()['x-frame-options']).toBe('DENY');
	});

	test('a production build carries HSTS', async ({ request }) => {
		const response = await request.get('/');
		expect(response.headers()['strict-transport-security']).toContain('max-age=');
	});

	test('the nonce differs between requests', async ({ request }) => {
		const nonceOf = async () => {
			const csp = (await request.get('/')).headers()['content-security-policy'] ?? '';
			return /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
		};
		const [first, second] = [await nonceOf(), await nonceOf()];
		expect(first).toBeTruthy();
		expect(first).not.toBe(second);
	});

	test('no console errors from blocked inline scripts on a normal page', async ({ page }) => {
		const violations: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
				violations.push(message.text());
			}
		});
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'RCOS Compass' })).toBeVisible();
		expect(violations).toEqual([]);
	});
});

test.describe('errors reveal nothing', () => {
	test('a 500 returns a generic message and the request id, and no internals', async ({ page }) => {
		const response = await page.goto('/__test/boom');
		expect(response?.status()).toBe(500);

		const body = await page.content();
		expect(body).not.toContain('SQLITE_ERROR');
		expect(body).not.toContain('secret_column');
		expect(body).not.toContain('/srv/app/src');
		expect(body).not.toMatch(/\bat\s+\w+\s+\(.*:\d+:\d+\)/); // stack frame

		await expect(page.getByText('Something went wrong on our side.')).toBeVisible();
		await expect(page.getByText(/Reference/)).toBeVisible();
	});

	test('the error page keeps the shell so a member can navigate away', async ({ page }) => {
		await page.goto('/__test/boom');
		await page.getByRole('link', { name: 'Back to the start' }).click();
		await expect(page.getByRole('heading', { name: 'RCOS Compass' })).toBeVisible();
	});

	test('a 404 is a 404, not an error report', async ({ page }) => {
		const response = await page.goto('/no-such-page');
		expect(response?.status()).toBe(404);
		expect(await page.content()).not.toContain('SQLITE_ERROR');
	});
});

test.describe('health', () => {
	test('reports build, migration and database state, and nothing else', async ({ request }) => {
		const response = await request.get('/healthz');
		expect(response.status()).toBe(200);

		const body = await response.json();
		expect(body).toEqual({
			status: 'ok',
			build: expect.any(String),
			migration: expect.any(String),
			database: 'ok'
		});
	});

	test('discloses no configuration values or secrets', async ({ request }) => {
		const text = await (await request.get('/healthz')).text();
		expect(text).not.toContain('BETTER_AUTH_SECRET');
		expect(text).not.toContain('e2e-secret-that-is-long-enough-to-pass');
		expect(text).not.toContain('DATABASE_URL');
		expect(text).not.toContain('file:');
	});

	test('needs no authentication', async ({ request }) => {
		expect((await request.get('/healthz')).status()).toBe(200);
	});
});

test.describe('request identity', () => {
	test('every response carries a request id header', async ({ request }) => {
		const response = await request.get('/');
		expect(response.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
	});
});

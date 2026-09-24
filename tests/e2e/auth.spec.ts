import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { seed, visit } from './support.js';

/**
 * The signed-out surface, against a real production build.
 *
 * These pages are the only ones an anonymous request is ever served, so their
 * behaviour when nothing is in flight matters as much as when something is: a
 * half-finished flow must send someone back to the start rather than render a
 * form that cannot work.
 */
test.describe('sign-in', () => {
	test('renders a labelled form with no accessibility violations', async ({ page }) => {
		await page.goto('/sign-in');

		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
		// Labels, not placeholders: the field must be findable by its name.
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test('answers a wrong password and an unknown address identically', async ({ page }) => {
		const bodies: string[] = [];
		for (const email of ['nobody@example.org', 'also-nobody@example.org']) {
			await page.goto('/sign-in');
			await expect(async () => {
				await page.getByLabel('Email').fill(email);
				await page.getByLabel('Password').fill('not-the-password-either');
				await page.getByRole('button', { name: 'Sign in' }).click();
				await expect(page.getByRole('alert')).toBeVisible({ timeout: 2_000 });
			}).toPass();
			bodies.push((await page.getByRole('alert').textContent()) ?? '');
		}

		expect(bodies[0]).toBe(bodies[1]);
		expect(bodies[0]).not.toContain('password');
	});
});

test.describe('the two-factor challenge', () => {
	test('sends you back to the start when no sign-in is in flight', async ({ page }) => {
		await page.goto('/sign-in/two-factor');
		// Not a form that cannot possibly succeed.
		await expect(page).toHaveURL(/\/sign-in$/);
	});
});

test.describe('the enrolment page', () => {
	test('is nothing to an anonymous visitor, wherever it is mounted', async ({ request }) => {
		// Under a community it is that community's settings, which a stranger may
		// not learn exist; in the console it is the console, which does not
		// announce itself. Both answer as a page that is not there.
		for (const path of ['/c/valle-verde/settings/two-factor', '/admin/settings/two-factor']) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status(), path).toBe(404);
		}
	});
});

test.describe('signing out', () => {
	test('is not something a link can do', async ({ request }) => {
		// A GET that ends a session can be fired by any image tag on any page.
		const response = await request.get('/sign-out', { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/');
	});
});

/**
 * The sign-in screens have no community to take a language from, so they take
 * the browser's — and only they do. `signInLocale` in `resolve-tenant.ts`.
 */
test.describe('signing in, in the browser’s language', () => {
	test('answers a German browser in German, refusal included', async ({ browser }) => {
		const context = await browser.newContext({ locale: 'de-DE' });
		const page = await context.newPage();

		const response = await page.goto('/sign-in');
		expect(response?.headers()['vary']?.toLowerCase()).toContain('accept-language');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();

		await visit(page, '/sign-in');
		await page.getByLabel('E-Mail').fill('nobody@example.org');
		await page.getByLabel('Passwort').fill('not-the-password-either');
		await page.getByRole('button', { name: 'Anmelden' }).click();
		await expect(page.getByRole('alert')).toHaveText(
			'Diese Angaben passen zu keinem Konto. Prüf sie und versuch es noch einmal.'
		);
		await context.close();
	});

	test('answers a Spanish browser in Spanish, and anything else in English', async ({
		browser
	}) => {
		for (const [locale, heading, lang] of [
			['es-EC', 'Iniciar sesión', 'es'],
			['fr-FR', 'Sign in', 'en']
		] as const) {
			const context = await browser.newContext({ locale });
			const page = await context.newPage();
			await page.goto('/sign-in');
			await expect(page.getByRole('heading', { name: heading }), locale).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('lang', lang);
			await context.close();
		}
	});

	test('does not change the language of a community', async ({ page, browser }) => {
		const fixture = await seed(page);
		const context = await browser.newContext({ locale: 'de-DE' });
		const german = await context.newPage();

		await visit(german, '/sign-in');
		await german.getByLabel('E-Mail').fill(fixture.email);
		await german.getByLabel('Passwort').fill(fixture.password);
		await german.getByRole('button', { name: 'Anmelden' }).click();
		await expect(german).toHaveURL(/\/(c\/|$)/, { timeout: 15_000 });

		// The community works in English, so it answers in English whoever asks.
		await visit(german, `/c/${fixture.slug}`);
		await expect(german.locator('html')).toHaveAttribute('lang', 'en');
		await expect(german.getByRole('link', { name: 'Dashboard' })).toBeVisible();
		await context.close();
	});
});

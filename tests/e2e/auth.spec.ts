import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
	test('asks an anonymous visitor to sign in first, and remembers where they were going', async ({
		page
	}) => {
		await page.goto('/account/two-factor');
		await expect(page).toHaveURL(/\/sign-in\?redirectTo=%2Faccount%2Ftwo-factor$/);
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

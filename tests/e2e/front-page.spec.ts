import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * The front page is a way in: the landing page for somebody who has not signed
 * in, and their own communities for somebody who has.
 */
test.describe('the front page', () => {
	test('offers a signed-out visitor the way to sign in', async ({ page }) => {
		await visit(page, '/');

		await page.getByRole('link', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/sign-in$/);
	});

	test('shows a signed-in member the landing page, with their account menu', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, '/');

		await expect(page.getByRole('heading', { level: 1 })).toContainText('agreements');
		await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);

		const menu = page.getByRole('button', { name: /your account/i });
		await expect(menu).toContainText(fixture.email);
		await menu.click();
		await expect(page.getByRole('menu')).toContainText(fixture.email);
		await page.getByRole('menuitem', { name: 'Valle Verde' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}$`));
	});

	test('signs a member out from the account menu', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, '/');

		await page.getByRole('button', { name: /your account/i }).click();
		await page.getByRole('menuitem', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/sign-in$/);

		await visit(page, '/');
		await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect(page.getByRole('button', { name: /your account/i })).toHaveCount(0);
	});

	test('reaches a community and signs out without JavaScript @no-js', async ({ page }) => {
		const fixture = await seed(page);
		// Signing in works without scripts too: a plain form post.
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill(fixture.email);
		await page.getByLabel('Password').fill(fixture.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.goto('/');

		await page.locator('summary', { hasText: fixture.email }).click();
		await expect(page.getByRole('link', { name: 'Valle Verde', exact: true })).toHaveAttribute(
			'href',
			new RegExp(`/c/${fixture.slug}$`)
		);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	});
});

test.describe('the landing page', () => {
	test('has one headline and asks for pilot access by mail, not a sign-up form', async ({
		page
	}) => {
		await visit(page, '/');

		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('agreements');
		// CONTACT_EMAIL is set for the e2e server (playwright.config.ts).
		const requests = page.getByRole('link', { name: /request (pilot )?access/i });
		await expect(requests).toHaveCount(3);
		for (const link of await requests.all()) {
			await expect(link).toHaveAttribute('href', /^mailto:pilot@example\.org\?subject=/);
		}
		await expect(page.getByRole('link', { name: 'Contact' })).toHaveAttribute(
			'href',
			'mailto:pilot@example.org'
		);
	});

	test('tells search engines and link previews what it is', async ({ page, baseURL }) => {
		await visit(page, '/');

		await expect(page).toHaveTitle(/RCOS Compass/);
		const meta = (selector: string) => page.locator(selector).getAttribute('content');
		expect((await meta('meta[name="description"]'))?.length).toBeGreaterThan(50);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/`);
		expect(await meta('meta[property="og:url"]')).toBe(`${baseURL}/`);

		// Absolute — a relative og:image is ignored — and really there.
		const image = await meta('meta[property="og:image"]');
		expect(image).toBe(`${baseURL}/og-image.png`);
		const served = await page.request.get(image!);
		expect(served.ok()).toBe(true);
		expect(served.headers()['content-type']).toBe('image/png');

		const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
		expect(blocks).toHaveLength(1);
		const graph = JSON.parse(blocks[0]!)['@graph'] as { '@type': string; name?: string }[];
		expect(graph.map((node) => node['@type'])).toEqual(
			expect.arrayContaining(['WebSite', 'WebPage', 'SoftwareApplication', 'CreativeWork'])
		);
		expect(graph.find((node) => node['@type'] === 'SoftwareApplication')?.name).toBe(
			'RCOS Compass'
		);
	});

	test('serves the icons and manifest its head points to', async ({ page }) => {
		await visit(page, '/');

		for (const selector of [
			'link[rel="icon"][type="image/svg+xml"]',
			'link[rel="icon"][sizes="48x48"]',
			'link[rel="apple-touch-icon"]',
			'link[rel="manifest"]'
		]) {
			const href = await page.locator(selector).getAttribute('href');
			const response = await page.request.get(new URL(href!, page.url()).href);
			expect(response.ok(), `${selector} → ${href}`).toBe(true);
		}
	});

	test('lets a visitor pick a stage of the tour and stop it', async ({ page }) => {
		await visit(page, '/');
		const tour = page.locator('#how');
		await tour.scrollIntoViewIfNeeded();

		await tour.getByRole('button', { name: /03/ }).click();
		await expect(tour.getByRole('button', { name: /03/ })).toHaveAttribute('aria-current', 'step');
		await expect(
			tour.getByText('The version everyone can live with becomes a recorded decision.')
		).toBeVisible();

		await tour.getByRole('button', { name: 'Pause tour' }).click();
		await expect(tour.getByRole('button', { name: 'Play tour' })).toBeVisible();
	});

	test('does not start the tour by itself for somebody who asked for less motion', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await visit(page, '/');

		await expect(page.locator('#how').getByRole('button', { name: 'Play tour' })).toBeVisible();
	});

	test('follows the reader through the year in Valle Verde', async ({ page }) => {
		await visit(page, '/');
		const story = page.locator('#story');

		await expect(story.getByText('01 / 14')).toBeAttached();
		await story
			.getByRole('heading', { name: 'Every word explained, everywhere.' })
			.scrollIntoViewIfNeeded();
		await expect(story.getByText('14 / 14')).toBeAttached();
	});

	test('reads in full without JavaScript @no-js', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.locator('#story h3')).toHaveCount(14);
		for (const heading of await page.locator('#story h3').all()) {
			await expect(heading).toBeVisible();
		}
		await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', /\/sign-in$/);
	});
});

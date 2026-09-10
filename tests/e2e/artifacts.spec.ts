import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * The twenty-one things the standard asks for. Design: artboard 12.
 *
 * The counting already existed — the sidebar has said "3 of 21 artifacts
 * complete" since P1 — and there was nowhere to go and find out which three, or
 * what the other eighteen were. This spec is about that: the list is the answer
 * to a question the shell had been raising and not answering.
 */
test.describe('the artifacts a community owes', () => {
	test('lists every one, with how far along it is', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/artifacts`);

		const list = page.locator('main ul').first();
		// Twenty-two in core 0.1, twenty-one of them required.
		await expect(list.getByRole('listitem')).toHaveCount(22);

		// A day-one community has started nothing, and the page says so in words
		// rather than leaving twenty-two rows to be read for it.
		await expect(page.getByText(/of 22 complete/)).toBeVisible();
		await expect(page.getByText(/required, not started/)).toBeVisible();
		await expect(list.getByText('Not started').first()).toBeVisible();
	});

	test('refuses to turn compliance into a percentage', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/artifacts`);

		// `services/claim.ts` is emphatic that "73% compliant" must never reach a
		// community's website. The screen that lists what is missing is the most
		// likely place for one to appear, so it is the place to assert it does not.
		await expect(page.getByText('Compliance is binary', { exact: false })).toBeVisible();
		await expect(page.locator('main')).not.toContainText('% compliant');
	});

	test('sends you to the artifact you picked, not to the top of the standard', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/artifacts`);

		const row = page.locator('main ul > li').first();
		const title = (await row.getByRole('heading').textContent())!.trim();
		await row.getByRole('link').first().click();

		await expect(page).toHaveURL(/\/standard#/);
		await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	});

	test('is reachable from the shell', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}`);

		await page.getByRole('navigation', { name: 'Community' }).getByText('Artifacts').click();
		await expect(page.getByRole('heading', { level: 1, name: 'Artifacts' })).toBeVisible();
	});
});

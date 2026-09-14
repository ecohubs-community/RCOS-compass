import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * A steward changing the language every member reads. `docs/09` §i18n.
 *
 * The screen is the requirement: the locale is a column, and a column a
 * community cannot reach is a setting only we can change. Asserted through the
 * navigation rather than the page's own headings, because the nav is rendered by
 * the layout on every screen — if it is German, the interface is.
 */
test.describe('the language a community works in', () => {
	test('a steward changes it, and every screen follows', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/settings/language`);
		await expect(page.getByRole('navigation', { name: 'Community' })).toContainText('Dashboard');

		await page.getByLabel('Language').selectOption('de');
		await page.getByRole('button', { name: 'Save' }).click();

		// The nav is the layout's, so this is the whole interface answering.
		await expect(page.getByRole('navigation', { name: /Gemeinschaft|Community/ })).toContainText(
			'Übersicht'
		);

		// And the standard's own words follow the same setting.
		await visit(page, `/c/${fixture.slug}/standard`);
		await expect(page.locator('main')).toContainText('Zweck');
	});

	test('a member can see it but not change it', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);

		await visit(page, `/c/${fixture.slug}/settings/language`);
		await expect(page.getByText(/Only a steward/i).first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
	});
});

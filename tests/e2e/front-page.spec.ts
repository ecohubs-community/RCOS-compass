import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * The front page is a way in: to sign in for somebody who has not, and to their
 * own communities for somebody who has.
 */
test.describe('the front page', () => {
	test('offers a signed-out visitor the way to sign in', async ({ page }) => {
		await visit(page, '/');

		await page.getByRole('link', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/sign-in$/);
	});

	test('takes a signed-in member to their community', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, '/');

		await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
		await page.getByRole('link', { name: 'Valle Verde' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}$`));
	});
});

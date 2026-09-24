import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * The reader's own account, reached from the ⋯ beside their name: Preferences
 * opens the Account panel of the settings, Sign out signs out.
 */
test.describe('the account menu', () => {
	test('opens Preferences on the Account panel, where a new name reaches the sidebar', async ({
		page
	}) => {
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, `/c/${fixture.slug}`);

		const sidebar = page.locator('aside');
		await expect(sidebar.getByText('Lena Vogt')).toBeVisible();

		await page.getByRole('button', { name: 'Account options' }).click();
		await page.getByRole('menuitem', { name: 'Preferences' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/settings/account$`));
		await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();

		// A member, not a steward, and still their own panel to change.
		await expect(page.getByLabel('Email')).toHaveValue(fixture.member.email);
		await expect(page.getByLabel('Email')).toBeDisabled();

		await page.getByLabel('Name').fill('Lena V.');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByRole('status')).toHaveText('Saved.');
		await expect(sidebar.getByText('Lena V.')).toBeVisible();

		// And the same name everywhere else the community names its members.
		await visit(page, `/c/${fixture.slug}/members`);
		await expect(page.locator('main').getByText('Lena V.')).toBeVisible();
	});

	test('refuses an empty name beside the field', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, `/c/${fixture.slug}/settings/account`);

		// `required` would stop the browser first; this is the server's answer.
		await page.getByLabel('Name').evaluate((input) => input.removeAttribute('required'));
		await page.getByLabel('Name').fill('   ');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByRole('alert')).toBeVisible();

		await visit(page, `/c/${fixture.slug}`);
		await expect(page.locator('aside').getByText('Lena Vogt')).toBeVisible();
	});

	test('signs out', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}`);

		await page.getByRole('button', { name: 'Account options' }).click();
		await page.getByRole('menuitem', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/sign-in$/);
		expect((await page.request.get(`/c/${fixture.slug}`)).status()).toBe(404);
	});

	test('is a link and a button without JavaScript @no-js', async ({ page, browser }) => {
		const fixture = await seed(page);
		const scripted = await browser.newContext({ javaScriptEnabled: true });
		await signIn(await scripted.newPage(), fixture.email, fixture.password);
		await page.context().addCookies((await scripted.storageState()).cookies);
		await scripted.close();

		await page.goto(`/c/${fixture.slug}`);
		await page.getByRole('link', { name: 'Preferences' }).click();
		await expect(page).toHaveURL(new RegExp(`/settings/account$`));

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/sign-in$/);
	});

	test('speaks the community’s language on the Two-factor panel', async ({ page }) => {
		const fixture = await seed(page, { locale: 'de' });
		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, `/c/${fixture.slug}/settings/two-factor`);

		await expect(
			page.getByRole('heading', { level: 1, name: 'Zwei-Faktor-Authentifizierung' })
		).toBeVisible();
		await expect(page.getByLabel('Dein Passwort')).toBeVisible();

		// A refusal from the server, not only the labels the page was built with.
		await page.getByLabel('Dein Passwort').fill('not-the-password');
		await page.getByRole('button', { name: 'Zwei-Faktor-Authentifizierung einrichten' }).click();
		await expect(page.getByRole('alert')).toHaveText('Dieses Passwort wurde nicht akzeptiert.');
	});
});

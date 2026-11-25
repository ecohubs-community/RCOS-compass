import { expect, test } from '@playwright/test';
import { seedWithProposal, signIn, visit } from './support.js';

/**
 * The freeze opens where it can be read. `openspec/changes/pilot-blockers`,
 * decisions — "The freeze form opens where it can be read".
 *
 * It used to open at the end of the thread column — about 220px of a long form
 * visible at 1280×800 — and its scroll-into-view pointed at an element that was
 * never bound, so pressing "Freeze" looked like nothing happened.
 */
const SHEET = /^Freeze v\d+ into a decision$/;

test.describe('the freeze sheet', () => {
	test('opens, records who was present — including someone who did not answer', async ({
		page
	}) => {
		test.slow();
		const fixture = await seedWithProposal(page);

		await page.getByRole('button', { name: /^Freeze v\d+$/ }).click();
		const sheet = page.getByRole('dialog', { name: SHEET });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByRole('button', { name: 'Record decision' })).toBeInViewport();

		// Every current member is offered; Lena answered nothing and was there.
		const present = sheet.getByRole('group', { name: 'Who was present' });
		await expect(present.getByLabel('Ana Restrepo')).toBeVisible();
		await expect(present.getByLabel('Ana Restrepo')).not.toBeChecked();
		await present.getByLabel('Lena Vogt').check();

		await sheet.getByLabel('Mechanism').fill('consent');
		await sheet.getByRole('button', { name: 'Record decision' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/d/DEC-`));
		// Nobody answered, so nobody was pre-selected: the one present is Lena.
		await expect(page.locator('main')).toContainText('1 present.');
	});

	test('closes on Escape, records nothing, and gives focus back', async ({ page }) => {
		test.slow();
		await seedWithProposal(page);

		const open = page.getByRole('button', { name: /^Freeze v\d+$/ });
		await open.click();
		await expect(page.getByRole('dialog', { name: SHEET })).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: SHEET })).toHaveCount(0);
		await expect(open).toBeFocused();
		await expect(page).not.toHaveURL(/\/d\/DEC-/);
	});

	test('on a phone, "Record decision" stays on screen and nothing scrolls sideways', async ({
		page
	}) => {
		test.slow();
		await page.setViewportSize({ width: 375, height: 740 });
		await seedWithProposal(page);

		await page.getByRole('button', { name: /^Freeze v\d+$/ }).click();
		const sheet = page.getByRole('dialog', { name: SHEET });
		const record = sheet.getByRole('button', { name: 'Record decision' });
		await expect(record).toBeInViewport();

		// To the end of the form, and the act is still there.
		await sheet.getByLabel(/^Rationale/).scrollIntoViewIfNeeded();
		await expect(record).toBeInViewport();

		const sideways = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(sideways).toBe(false);
	});

	test('?freeze=1 opens the form, and without JavaScript it records the decision', async ({
		page,
		browser
	}) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const thread = new URL(page.url());

		// The same session, in a browser that runs no script at all.
		const plain = await browser.newContext({
			javaScriptEnabled: false,
			storageState: await page.context().storageState()
		});
		const noScript = await plain.newPage();
		await noScript.goto(`${thread.origin}${thread.pathname}?freeze=1`);

		const form = noScript.getByRole('region', { name: SHEET });
		await expect(form).toBeVisible();

		await form.getByLabel('Mechanism').fill('consent');
		await form.getByRole('button', { name: 'Record decision' }).click();
		await expect(noScript).toHaveURL(new RegExp(`/c/${fixture.slug}/d/DEC-`));
		await plain.close();
	});

	test('a member is offered no freeze, even with ?freeze=1', async ({ page, browser }) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const thread = new URL(page.url());

		const theirs = await browser.newContext();
		const member = await theirs.newPage();
		await signIn(member, fixture.member.email, fixture.member.password);
		await visit(member, `${thread.pathname}?freeze=1`);

		await expect(member.getByRole('button', { name: /^Freeze v\d+$/ })).toHaveCount(0);
		await expect(member.getByRole('dialog', { name: SHEET })).toHaveCount(0);
		await expect(member.getByRole('region', { name: SHEET })).toHaveCount(0);
		await theirs.close();
	});
});

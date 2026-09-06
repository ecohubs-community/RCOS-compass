import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support';

/**
 * The ordering, as a community actually meets it. UI spec §4.4.
 *
 * The integration suite proves the arithmetic. What it cannot prove is that a
 * community can *reach* the argument: that the reasons are on the screen, that
 * moving something works without a mouse, and that the tool says which of the
 * two positions is theirs.
 */
test.describe('the path a community can argue with', () => {
	test('says why each item is where it is, and offers the interview', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		// A day-one community is told the order is structural rather than left to
		// assume the list was tailored to them.
		await expect(page.getByText('This order is structural')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Answer them' })).toBeVisible();

		const list = page.getByRole('list', { name: 'What to decide next' });
		await expect(list.getByRole('listitem').first()).toContainText(
			'Nothing else has to be decided first'
		);
	});

	test('moves an item by keyboard alone, and says both positions', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		const items = page.getByRole('list', { name: 'What to decide next' }).getByRole('listitem');
		const second = await items.nth(1).innerText();

		// Dragging is the fast way; this is the way that works on a phone and with
		// a keyboard, and both are supported surfaces.
		const up = page.getByRole('button', { name: /^Move .* up$/ }).nth(1);
		await up.focus();
		await expect(up).toBeFocused();
		await page.keyboard.press('Enter');

		await expect(items.first()).toContainText(second.split('\n')[0]!);
		await expect(items.first()).toContainText('The ordering puts it at 2');

		await page.getByRole('button', { name: 'Release' }).click();
		await expect(page.getByText('The ordering puts it at')).toBeHidden();
	});

	test('shows the weights, and what changing them produces', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/settings/path`);

		await expect(page.getByText('These are the numbers Compass ships with')).toBeVisible();

		await page.getByLabel('What you told us about yourselves').fill('200');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('These are the numbers Compass ships with')).toBeHidden();

		// The previous opinion stays readable from the second change onward — the
		// first one supersedes the shipped defaults, which are on the screen beside
		// every field rather than being a row.
		await page.getByLabel('What you told us about yourselves').fill('5');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect(page.getByRole('heading', { name: 'What it was before' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'What that produces' })).toBeVisible();
	});
});

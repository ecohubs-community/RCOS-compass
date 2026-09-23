import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * What a community wished the standard had asked for, read back.
 * `openspec/changes/standard-feedback-view`, UI spec §1.4b.
 *
 * The entry is recorded by the member and read by the steward, so the page is
 * shown to be the community's rather than its author's — and then read by the
 * member too, because recording one is a member right and a list of your own
 * words hidden from you would be the odd one out.
 */
const WORDS = 'Guests staying longer than a week need the circle’s consent';

test.describe('feedback on the standard', () => {
	test('a steward reads what a member recorded, and follows it to the definition', async ({
		page
	}) => {
		test.slow();
		const fixture = await seed(page, { standardFeedback: true });
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/settings`);
		await page
			.getByRole('navigation', { name: 'Settings' })
			.getByRole('link', { name: 'Feedback on the standard' })
			.click();
		await expect(page.getByRole('heading', { name: 'Feedback on the standard' })).toBeVisible();

		const entry = page.getByRole('listitem').filter({ hasText: WORDS });
		await expect(entry).toContainText('Recorded by Lena Vogt');
		await expect(entry).toContainText('About rcos-core v0.1');

		await entry.getByRole('link', { name: 'Open the definition' }).click();
		await expect(page).toHaveURL(/\/definitions\//);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(WORDS);
	});

	test('a member reads it too, and it fits a 375px phone', async ({ page }) => {
		test.slow();
		const fixture = await seed(page, { standardFeedback: true });
		await signIn(page, fixture.member.email, fixture.member.password);

		await page.setViewportSize({ width: 375, height: 667 });
		await visit(page, `/c/${fixture.slug}/settings/standard-feedback`);
		await expect(page.getByText(WORDS)).toBeVisible();

		// Nothing wider than the screen: a sideways scroll is how a phone layout
		// fails without anything looking broken on a desktop.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('a community that has recorded nothing is told how an entry gets there', async ({
		page
	}) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/settings/standard-feedback`);
		await expect(page.getByText(/Nothing recorded yet/)).toBeVisible();
		await expect(page.getByText(/RCOS should require this/).first()).toBeVisible();
	});
});

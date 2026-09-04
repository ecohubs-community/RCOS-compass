import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedWithProposal, visit } from './support.js';

/**
 * docs/02-component-guidelines.md §6 commits to WCAG 2.1 AA. The gallery is the
 * target because it renders every primitive in every state, at every viewport in
 * the Playwright matrix.
 */
const scan = (page: Page) =>
	new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

test.describe('accessibility', () => {
	test('the front page has no violations', async ({ page }) => {
		await page.goto('/');
		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test('the error page has no violations', async ({ page }) => {
		await page.goto('/__test/boom');
		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test('the sign-in page has no violations', async ({ page }) => {
		await page.goto('/sign-in');
		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	/**
	 * Every screen of the loop, at whichever viewport this project runs.
	 * docs/06 §7: the matrix is 375 / 768 / 1024 / 1440, and mobile is a
	 * supported surface rather than a courtesy — the definition triad becomes
	 * toggles below 1024px, and that is exactly where an a11y bug would hide.
	 */
	test('every screen of the loop has no violations', async ({ page }) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const threadUrl = page.url();

		for (const url of [
			`/c/${fixture.slug}`,
			`/c/${fixture.slug}/standard`,
			`/c/${fixture.slug}/discussions`,
			threadUrl,
			`/c/${fixture.slug}/decisions`
		]) {
			await page.goto(url);
			const results = await scan(page).analyze();
			expect(results.violations, `${url} has accessibility violations`).toEqual([]);
		}
	});

	test('the document screens have no violations', async ({ page }) => {
		test.slow();
		const fixture = await seedWithProposal(page);

		await visit(page, `/c/${fixture.slug}/documents`);
		expect((await scan(page).analyze()).violations).toEqual([]);
	});

	test('the freeze form has no violations, open', async ({ page }) => {
		test.slow();
		await seedWithProposal(page);
		// Opened by the server, so this holds with no JavaScript too.
		await page.goto(`${page.url()}?freeze=1`);
		await expect(page.getByRole('region', { name: 'Record this decision' })).toBeVisible();

		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test('the loop is reachable by keyboard alone', async ({ page }) => {
		test.slow();
		// docs/06 §7 asks for a keyboard-only pass. The thing that would break it
		// is a control that is only a click target: every interactive element here
		// has to take focus and answer to Enter.
		const fixture = await seedWithProposal(page);
		await visit(page, `/c/${fixture.slug}/decisions`);

		const search = page.getByLabel('Search decisions by what they say');
		await search.focus();
		await expect(search).toBeFocused();
		await page.keyboard.type('leave');
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/q=leave/, { timeout: 15_000 });
	});

	test('nothing insists on motion', async ({ page }) => {
		test.slow();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const fixture = await seedWithProposal(page);
		await page.goto(`/c/${fixture.slug}`);

		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});
});

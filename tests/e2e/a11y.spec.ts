import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
});

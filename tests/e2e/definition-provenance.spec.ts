import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { freezeOnOpenThread, seedWithProposal, visit } from './support.js';

/**
 * `openspec/changes/provenance-ui` group 3: the definition page says how the
 * community got to its rule — the decision, the versions, the thread — one
 * glance from the rule itself (UI spec §4.3).
 */
test.describe('a definition shows how the community got here', () => {
	test('an adopted definition names its decision, its version and the thread it came from', async ({
		page
	}) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const thread = page.url().split('?')[0]!;
		await freezeOnOpenThread(page, 'consent');
		await expect(page).toHaveURL(/\/d\/DEC-\d{4}-\d{3}$/);
		const ref = page.url().split('/').at(-1)!;

		await visit(page, `/c/${fixture.slug}/standard`);
		await page.getByRole('link', { name: 'Primary Purpose', exact: true }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Primary Purpose' })).toBeVisible();
		await expect(page.locator('main')).toContainText('Adopted');

		const history = page.locator('#panel-history');
		// Below 1024px the triad is one panel at a time.
		if (!(await history.isVisible())) {
			await page.getByRole('button', { name: 'How we got here' }).click();
		}
		await expect(history.getByRole('link', { name: ref }).first()).toBeVisible();
		await expect(history).toContainText('consent');
		await expect(history.getByText('v1', { exact: true })).toBeVisible();
		await expect(history.getByText('current')).toBeVisible();
		await expect(
			history.getByRole('link', { name: 'Can someone leave at any time?' })
		).toHaveAttribute('href', new URL(thread).pathname);

		// Changing it starts from here.
		await expect(page.getByRole('link', { name: 'Open discussion' })).toBeVisible();

		const scan = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(scan.violations).toEqual([]);
	});
});

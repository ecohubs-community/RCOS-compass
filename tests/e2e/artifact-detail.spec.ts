import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { freezeOnOpenThread, seed, seedWithProposal, signIn, visit } from './support.js';

/**
 * `openspec/changes/provenance-ui` group 4: one page per artifact, completeness
 * as counts and a share of sections, and publishing as a decision.
 */
test.describe('an artifact has a page', () => {
	test('a fresh artifact says what it asks for and what is missing, never as compliance', async ({
		page
	}) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/artifacts`);
		await expect(page.locator('main')).toContainText('0 of 4 sections · 0%');
		await expect(page.locator('main')).not.toContainText('% compliant');

		await visit(page, `/c/${slug}/artifacts/purpose-charter`);
		await expect(page.getByRole('heading', { level: 1, name: 'Purpose Charter' })).toBeVisible();
		await expect(page.getByText('0 of 4 sections answered · 0%')).toBeVisible();
		const blockers = page.getByRole('region', { name: 'What stands in the way' });
		await expect(blockers.getByText('Primary Purpose')).toBeVisible();
		await expect(page.locator('main')).not.toContainText('% compliant');
		// A Ratification Record is listed, and not counted.
		await expect(page.getByText('Written from a decision — not counted')).toBeVisible();

		const scan = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(scan.violations).toEqual([]);
	});

	test('publishing from the page is a decision, and the public page shows no percentage', async ({
		page,
		browser
	}) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		await freezeOnOpenThread(page, 'consent');
		await expect(page).toHaveURL(/\/d\/DEC-/);

		await visit(page, `/c/${fixture.slug}/artifacts/purpose-charter`);
		await expect(page.getByText('1 of 4 sections answered · 25%')).toBeVisible();
		const publication = page.getByRole('region', { name: 'Publication' });
		await expect(publication).toContainText('Never published.');
		await publication.getByRole('button', { name: 'Publish' }).click();
		await expect(publication.getByText('Published', { exact: true })).toBeVisible();
		const ref = publication.getByRole('link', { name: /^DEC-\d{4}-\d{3}$/ });
		await expect(ref).toBeVisible();
		await ref.click();
		await expect(page.getByRole('heading', { name: /Published Purpose Charter/ })).toBeVisible();

		await visit(page, `/c/${fixture.slug}/settings/publishing`);
		await page.getByRole('checkbox', { name: /public pages/i }).check();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText(/turned on this community/i)).toBeVisible();

		const visitor = await (await browser.newContext()).newPage();
		const response = await visitor.goto(`/p/${fixture.slug}/a/purpose-charter`);
		expect(response?.status()).toBe(200);
		await expect(visitor.locator('main')).not.toContainText('%');
	});
});

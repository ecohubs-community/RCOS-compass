import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * `openspec/changes/layer-artifact-checks`: each layer's artifact rules, shown
 * on the standard page rather than asked on the Path.
 */
test.describe('layer checks on the standard page', () => {
	test('a fresh community sees what is missing, layer by layer', async ({ page }) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/standard`);

		const layer0 = page.getByRole('region', { name: /Layer 0 · .* — checks/ });
		await expect(layer0).toBeVisible();
		await expect(page.getByRole('region', { name: /— checks$/ })).toHaveCount(7);

		const complete = layer0
			.getByRole('listitem')
			.filter({ hasText: 'Every mandatory artifact is complete' });
		await expect(complete).toContainText('Not met');
		await expect(complete.getByRole('link', { name: '§2.5.1' })).toBeVisible();
		await complete.getByText('Show 4').click();
		await expect(complete.getByText('Purpose Charter')).toBeVisible();

		await expect(
			layer0.getByRole('listitem').filter({ hasText: 'Readable by every member' })
		).toContainText('Nothing adopted yet');

		const scan = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(scan.violations).toEqual([]);
	});

	test('the checks stay when only unanswered sections are shown', async ({ page }) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/standard?gaps=1`);
		await expect(page.getByRole('region', { name: /— checks$/ })).toHaveCount(7);
	});
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * docs/02-component-guidelines.md §8: the gallery is the review surface and the
 * accessibility target. It runs at every viewport in the matrix, because mobile
 * is a supported surface (§7), not a courtesy.
 */
test.beforeEach(async ({ page }) => {
	await page.goto('/dev/components');
});

test('renders every primitive without accessibility violations', async ({ page }) => {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
});

test('shows every status and both modifiers', async ({ page }) => {
	for (const label of [
		'Not started',
		'Drafting',
		'In discussion',
		'In vote',
		'Adopted',
		'Needs review'
	]) {
		await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
	}
	await expect(page.getByText('Provisional', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('AI-drafted', { exact: true }).first()).toBeVisible();
});

test('help tips open by click and close by Escape, with focus restored', async ({ page }) => {
	const trigger = page.getByRole('button', { name: 'What is Definition linter?' });
	const content = page.getByText('A check on whether a definition does the job');

	// The click is retried rather than slept before: a click that lands before
	// hydration does nothing, and a fixed sleep would trade one flake for another.
	await expect(async () => {
		await trigger.click();
		await expect(content).toBeVisible({ timeout: 1_000 });
	}).toPass();

	await page.keyboard.press('Escape');
	await expect(content).toBeHidden();
	// Focus returns to the trigger — Bits UI owns this, and we assert we get it.
	await expect(trigger).toBeFocused();
});

test('help tips are reachable by keyboard alone', async ({ page }) => {
	const trigger = page.getByRole('button', { name: 'What is Readiness?' });
	const content = page.getByText('How many of the standard’s required clauses');

	await expect(async () => {
		await trigger.focus();
		await page.keyboard.press('Enter');
		await expect(content).toBeVisible({ timeout: 1_000 });
	}).toPass();
});

test('a pending button is busy and not clickable twice', async ({ page }) => {
	const pending = page.getByRole('button', { name: 'Recording' });
	await expect(pending).toBeDisabled();
	await expect(pending).toHaveAttribute('aria-busy', 'true');
});

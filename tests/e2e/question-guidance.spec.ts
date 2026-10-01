import { expect, test, type Page } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * `openspec/changes/path-question-guidance`.
 *
 * A thread says what a proposal should cover and shows example answers, each
 * labelled as an example and by where it came from — collapsed until asked for,
 * and openable with no JavaScript.
 */

const VOLUNTARY = /How can someone leave whenever they choose/;

async function startFromPath(page: Page, slug: string, question: RegExp) {
	await visit(page, `/c/${slug}/path?all=1`);
	await page
		.getByRole('list', { name: 'What to decide next' })
		.getByRole('listitem')
		.filter({ hasText: question })
		.getByRole('link', { name: 'Start discussion' })
		.click();
	await expect(page.getByLabel('Start a discussion')).toHaveValue(question);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/c/${slug}/discussions/[^/?]+`));
}

test.describe('what to cover', () => {
	test('lists the sub-questions and labelled examples in a thread', async ({ page }) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await startFromPath(page, slug, VOLUNTARY);

		const guide = page.locator('details').filter({ hasText: 'What to cover' }).first();
		await expect(guide.getByText('A proposal for this question should answer:')).toBeHidden();
		await guide.getByText('What to cover', { exact: true }).click();
		await expect(guide.getByText(/How does someone tell us they are leaving/)).toBeVisible();

		await guide.getByText('Examples — not recommendations').click();
		await expect(guide.getByText('Example written for Compass')).toBeVisible();
		await expect(guide.getByText(/^Any member can leave the community at any time/)).toBeVisible();
		await expect(guide.getByText('From the RCOS template').first()).toBeVisible();
		await expect(guide.getByText(/within 24 hours of confirmation/)).toBeVisible();
	});

	test('is not offered for a thread about nothing in the standard', async ({ page }) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('The dinner rota');
		await page.getByRole('button', { name: 'Start', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'The dinner rota' })).toBeVisible();
		await expect(page.getByText('What to cover', { exact: true })).toHaveCount(0);
	});

	test('opens without JavaScript @no-js', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		const fixture = await seed(page);
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill(fixture.email);
		await page.getByLabel('Password').fill(fixture.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await page.goto(`/c/${fixture.slug}/path?all=1`);
		await page
			.getByRole('listitem')
			.filter({ hasText: VOLUNTARY })
			.getByRole('link', { name: 'Start discussion' })
			.click();
		await page.getByRole('button', { name: 'Start', exact: true }).click();

		await page.getByText('What to cover', { exact: true }).click();
		await expect(page.getByText(/How does someone tell us they are leaving/)).toBeVisible();
		await context.close();
	});
});

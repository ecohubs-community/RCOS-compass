import AxeBuilder from '@axe-core/playwright';
import { expect, type Browser, type Page } from '@playwright/test';
import { test } from '@playwright/test';
import { seed, seedWithProposal, signIn, visit, type Fixture } from './support.js';

/**
 * The consent round as a view, and asking for an earlier version back.
 * `openspec/changes/provenance-ui` groups 5 and 6.
 */
const rail = (page: Page) => page.getByRole('complementary', { name: 'On the table' });

/** Signed in with no JavaScript at all: plain `goto`, never `visit`. */
async function withoutScripts(browser: Browser, email: string, password: string) {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/(c\/|$)/);
	return page;
}

test.describe('the round view', () => {
	test('works with no JavaScript: a closing time, what it takes to pass, a resolved objection @no-js', async ({
		browser
	}) => {
		// Two people signing in, each a password hash: slow under a parallel run.
		test.slow();
		const setup = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
		const fixture: Fixture = await seed(setup);
		const steward = await withoutScripts(browser, fixture.email, fixture.password);

		await steward.goto(`/c/${fixture.slug}/discussions`);
		await steward.getByLabel('Start a discussion').fill('A round with a deadline');
		await steward.getByRole('button', { name: 'Start' }).click();
		await steward.getByRole('link', { name: 'Revise the proposal' }).click();
		await steward.getByLabel('The text a decision would adopt').fill('Members may leave.');
		await steward.getByRole('button', { name: /^Save as v/ }).click();
		const thread = steward.url().split('?')[0]!;

		// Nobody has answered: setting a closing time opens the round.
		await rail(steward).getByText('Set when the round closes').click();
		await rail(steward).getByLabel('Closes at').fill('2030-01-15T20:00');
		await rail(steward).getByRole('button', { name: 'Open the round' }).click();
		await expect(rail(steward)).toContainText(/Closes 15 Jan 2030, 20:00 \S+ · \d+ days left/);
		await expect(steward.getByText(/^Opened the round on v1, closing 15 Jan 2030/)).toBeVisible();
		const pass = rail(steward).getByRole('region', { name: 'What it takes to pass' });
		await expect(pass).toContainText('has not recorded an interim adoption rule');
		await expect(pass).toContainText('Responded');

		// A member objects, with no scripts either.
		const member = await withoutScripts(browser, fixture.member.email, fixture.member.password);
		await member.goto(thread);
		await rail(member).getByLabel('Add a reason').fill('Nothing about shared tools.');
		await rail(member).getByRole('button', { name: 'Object' }).click();

		// The steward resolves it, and the note is required and kept.
		await steward.goto(thread);
		const objections = rail(steward).getByRole('region', { name: 'Open objections' });
		await expect(objections).toContainText('objects');
		await objections.getByText('Resolve', { exact: true }).click();
		await objections.getByLabel('How it was resolved').fill('v2 will cover tools.');
		await objections.getByRole('button', { name: 'Mark addressed' }).click();

		const resolved = rail(steward).getByRole('region', { name: 'Resolved objections' });
		await expect(resolved).toContainText('Nothing about shared tools.');
		await expect(resolved).toContainText('v2 will cover tools.');
		await expect(resolved).toContainText('Addressed by');
	});

	test('the rail with a round, an objection and its checklist has no violations', async ({
		page,
		browser
	}) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const thread = page.url().split('?')[0]!;

		const theirs = await (await browser.newContext()).newPage();
		await signIn(theirs, fixture.member.email, fixture.member.password);
		await visit(theirs, thread);
		await rail(theirs).getByLabel('Add a reason').fill('Too vague.');
		await rail(theirs).getByRole('button', { name: 'Object' }).click();
		await expect(rail(theirs).getByRole('region', { name: 'Open objections' })).toBeVisible();
		// Their own objection is theirs to withdraw; resolving it is not theirs.
		await expect(rail(theirs).getByRole('button', { name: 'Withdraw my objection' })).toBeVisible();
		await expect(rail(theirs).getByText('Resolve', { exact: true })).toHaveCount(0);

		await visit(page, thread);
		await expect(rail(page).getByRole('region', { name: 'What it takes to pass' })).toBeVisible();
		const scan = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(scan.violations).toEqual([]);
	});
});

test.describe('asking for an earlier version back', () => {
	test('a member asks, a steward puts it back', async ({ page, browser }) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const thread = page.url().split('?')[0]!;
		await page.getByRole('link', { name: 'Revise the proposal' }).click();
		await expect(page.getByRole('button', { name: /^Save as v/ })).toBeVisible({ timeout: 15_000 });
		await page
			.getByLabel('The text a decision would adopt')
			.fill('A member may leave with notice.');
		await page.getByRole('button', { name: /^Save as v/ }).click();
		await expect(rail(page).getByRole('heading', { name: 'Responses to v2' })).toBeVisible();

		const theirs = await (await browser.newContext()).newPage();
		await signIn(theirs, fixture.member.email, fixture.member.password);
		await visit(theirs, `${thread}?v=1`);
		await rail(theirs).getByLabel('Why').fill('v1 was simpler and nobody objected.');
		await rail(theirs).getByRole('button', { name: 'Ask for v1' }).click();
		await expect(theirs.getByText('asks to put v1 back on the table, instead of v2')).toBeVisible();
		await expect(theirs.getByText('Waiting for a steward.')).toBeVisible();
		// Asking moves nothing.
		await expect(rail(theirs)).toContainText('v2 is the version on the table');

		await visit(page, thread);
		const scan = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(scan.violations).toEqual([]);
		await page.getByRole('button', { name: 'Put v1 back', exact: true }).click();
		await expect(rail(page).getByRole('heading', { name: 'Responses to v1' })).toBeVisible();
		await expect(page.getByText(/^Granted by .* — v1 went back on the table\.$/)).toBeVisible();
	});
});

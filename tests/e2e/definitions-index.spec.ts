import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test } from '@playwright/test';
import {
	freezeOnOpenThread,
	seed,
	seedWithProposal,
	signIn,
	visit,
	type Fixture
} from './support.js';

/**
 * The definitions index, local definitions, and the change's exit flow.
 * `openspec/changes/provenance-ui` groups 0 and 7.
 */
const rail = (page: Page) => page.getByRole('complementary', { name: 'On the table' });
const axe = (page: Page) =>
	new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

/** Below 1024px the definition page shows one panel at a time; open the one named. */
async function panel(page: Page, name: string) {
	if ((page.viewportSize()?.width ?? 1440) >= 1024) return;
	const toggle = page.getByRole('button', { name, exact: true });
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

async function signedIn(page: Page, who: { email: string; password: string }) {
	const browser = page.context().browser()!;
	const other = await (await browser.newContext()).newPage();
	await signIn(other, who.email, who.password);
	return other;
}

test.describe('the definitions index', () => {
	test('a member creates a local definition, discusses it, and a steward freezes it', async ({
		page
	}) => {
		test.slow();
		const fixture: Fixture = await seed(page);
		const member = await signedIn(page, fixture.member);

		await visit(member, `/c/${fixture.slug}/definitions`);
		await expect(member.getByRole('link', { name: 'Definitions', exact: true })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await member.getByText('New local definition').click();
		await member.getByLabel('Name').fill('Thursday dinner');
		await member.getByLabel('Layer', { exact: true }).selectOption({ index: 1 });
		await member.getByLabel('Why we need this rule').fill('We eat together once a week.');
		await member.getByLabel('Clauses it touches').fill(fixture.clauseRef);
		await member.getByLabel('RCOS should require this').check();
		await member.getByRole('button', { name: 'Create' }).click();

		await expect(member.getByRole('heading', { level: 1, name: 'Thursday dinner' })).toBeVisible();
		await panel(member, 'Why we made this rule');
		await expect(member.getByText('We eat together once a week.')).toBeVisible();
		await expect(member.getByText('and satisfies none of them')).toBeVisible();

		await member.getByRole('link', { name: 'Start discussion' }).click();
		await member.getByRole('button', { name: 'Start' }).click();
		await member.getByRole('link', { name: 'Write a proposal' }).click();
		await member.getByLabel('The text a decision would adopt').fill('Dinner is at seven.');
		await member.getByRole('button', { name: /^Save as v/ }).click();
		await expect(rail(member).getByRole('heading', { name: 'Responses to v1' })).toBeVisible();
		const thread = member.url().split('?')[0]!;

		await signIn(page, fixture.email, fixture.password);
		await visit(page, thread);
		await freezeOnOpenThread(page);
		await expect(page).toHaveURL(/\/d\/DEC-/);

		await visit(page, `/c/${fixture.slug}/definitions`);
		// A table row from 768px, a card below it: whichever is showing.
		const row = page
			.locator('main tr, main li')
			.filter({ hasText: 'Thursday dinner' })
			.filter({ visible: true });
		await expect(row).toContainText('v1');
		await expect(row).toContainText('Adopted');
		await expect(row).toContainText('Local');
		expect((await axe(page)).violations).toEqual([]);

		await visit(page, `/c/${fixture.slug}/settings/standard-feedback`);
		await expect(page.getByText('Thursday dinner')).toBeVisible();
	});

	test('filters are links, and "needs my attention" finds the round waiting on me', async ({
		page
	}) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const thread = page.url().split('?')[0]!;
		// Frozen, so the definition exists; then a change to it, with a round open.
		await freezeOnOpenThread(page);
		await expect(page).toHaveURL(/\/d\/DEC-/);
		await visit(page, thread);
		await page.getByRole('link', { name: 'Revise the proposal' }).click();
		await expect(page.getByRole('button', { name: /^Save as v/ })).toBeVisible({
			timeout: 15_000
		});
		await page
			.getByLabel('The text a decision would adopt')
			.fill('A member may leave with notice.');
		await page.getByRole('button', { name: /^Save as v/ }).click();
		await expect(rail(page).getByRole('heading', { name: 'Responses to v2' })).toBeVisible();
		// The steward's own answer opens the round; the member has not answered.
		await rail(page).getByRole('button', { name: 'Consent' }).click();
		await expect(rail(page)).toContainText('1 consent');

		const member = await signedIn(page, fixture.member);
		await visit(member, `/c/${fixture.slug}/definitions?attention=1`);
		await expect(member.locator('main')).not.toContainText('No definitions match');
		await expect(
			member.getByText('Waiting on you').filter({ visible: true }).first()
		).toBeVisible();

		await visit(page, `/c/${fixture.slug}/definitions?attention=1`);
		await expect(page.getByText('No definitions match these filters.')).toBeVisible();
		await page.getByRole('link', { name: 'Clear filters' }).click();
		await expect(page.getByText('No definitions match these filters.')).toHaveCount(0);
	});
});

test.describe('the provenance exit flow', () => {
	test('a definition, its decision and thread, its artifact, a move back, a deadline and an answered objection', async ({
		page
	}) => {
		// The longest journey in the suite: four people-steps, two sign-ins, three versions.
		test.setTimeout(240_000);
		const fixture = await seedWithProposal(page);
		const thread = page.url().split('?')[0]!;
		await freezeOnOpenThread(page);
		await expect(page).toHaveURL(/\/d\/DEC-/);
		const ref = page.url().split('/d/')[1]!;

		// v2 and v3 go on the table after the freeze.
		await visit(page, thread);
		for (const [text, v] of [
			['A member may leave with notice.', 'v2'],
			['A member may leave with sixty days notice.', 'v3']
		]) {
			await page.getByRole('link', { name: 'Revise the proposal' }).click();
			await expect(page.getByRole('button', { name: /^Save as v/ })).toBeVisible({
				timeout: 15_000
			});
			await page.getByLabel('The text a decision would adopt').fill(text!);
			await page.getByRole('button', { name: /^Save as v/ }).click();
			await expect(rail(page).getByRole('heading', { name: `Responses to ${v}` })).toBeVisible({
				timeout: 15_000
			});
		}

		// A member finds the definition, its decision, its versions and its thread.
		const member = await signedIn(page, fixture.member);
		await visit(member, `/c/${fixture.slug}/definitions`);
		await member.locator('main a[href*="/definitions/"]').filter({ visible: true }).first().click();
		await panel(member, 'How we got here');
		await expect(
			member.getByRole('link', { name: ref }).filter({ visible: true }).first()
		).toBeVisible();
		await expect(member.locator('#versions + ol')).toContainText('v1');
		await expect(
			member
				.getByRole('link', { name: 'Can someone leave at any time?' })
				.filter({ visible: true })
				.first()
		).toBeVisible();

		// Its artifact, as counts and what stands in the way.
		await visit(member, `/c/${fixture.slug}/artifacts/purpose-charter`);
		await expect(member.getByText('1 of 4 sections answered · 25%')).toBeVisible();
		await expect(member.getByRole('region', { name: 'What stands in the way' })).toBeVisible();

		// The member asks for v2 back; the steward grants it.
		await visit(member, `${thread}?v=2`);
		await rail(member).getByLabel('Why').fill('v2 was simpler.');
		await rail(member).getByRole('button', { name: 'Ask for v2' }).click();
		await expect(member.getByText('Waiting for a steward.')).toBeVisible();
		await visit(page, thread);
		await page.getByRole('button', { name: 'Put v2 back', exact: true }).click();
		await expect(rail(page).getByRole('heading', { name: 'Responses to v2' })).toBeVisible();

		// The steward sets a closing time; the member objects; the steward answers it.
		await rail(page).getByText('Set when the round closes').click();
		await rail(page).getByLabel('Closes at').fill('2030-01-15T20:00');
		await rail(page)
			.getByRole('button', { name: /Save the closing time|Open the round/ })
			.click();
		await expect(rail(page)).toContainText('Closes 15 Jan 2030');

		await visit(member, thread);
		await rail(member).getByLabel('Add a reason').fill('Notice is missing.');
		await rail(member).getByRole('button', { name: 'Object' }).click();
		await expect(rail(member).getByRole('region', { name: 'Open objections' })).toBeVisible();

		await visit(page, thread);
		const objections = rail(page).getByRole('region', { name: 'Open objections' });
		await objections.getByText('Resolve', { exact: true }).click();
		await objections.getByLabel('How it was resolved').fill('Notice comes in the next version.');
		await objections.getByRole('button', { name: 'Mark addressed' }).click();
		await expect(rail(page).getByRole('region', { name: 'Resolved objections' })).toContainText(
			'Notice comes in the next version.'
		);
	});
});

import { expect, test, type Page } from '@playwright/test';
import { seed, seedWithProposal, signIn, visit } from './support.js';

/**
 * The rail, and the thing it exists to make true: a response belongs to one
 * version of a proposal, and everything on screen beside it belongs to that
 * same version.
 *
 * Driven through the screens rather than the services, because the failure this
 * guards against is a *rendering* one — five people consent, somebody revises
 * the wording, and the five consents stay on screen as if they were consents to
 * the new words. A service test cannot see that; a reader can.
 */

/** Revise the version on the table, and say what changed. */
async function revise(page: Page, text: string, note?: string) {
	// The composer's mode is a navigation, so wait for the editor itself before
	// typing — not for a URL. A client-side navigation fires no `load` event, so
	// `waitForURL` can hang on the very transition it is meant to wait for.
	await page.getByRole('link', { name: 'Revise the proposal' }).click();
	await expect(page.getByRole('button', { name: /^Save as v/ })).toBeVisible();
	await page.getByLabel('The text a decision would adopt').fill(text);
	if (note) await page.getByLabel('What changed').fill(note);
	await page.getByRole('button', { name: /^Save as v/ }).click();
}

const rail = (page: Page) => page.getByRole('complementary', { name: 'On the table' });
/** The version buttons, which are the rail's navigation. */
const versions = (page: Page) => page.getByRole('navigation', { name: 'Proposal versions' });

test.describe('one version at a time', () => {
	test('selecting a version takes its text, its responses and its linter with it', async ({
		page
	}) => {
		await seedWithProposal(page);

		// v1 is agreed by the steward, then the text changes.
		await rail(page).getByRole('button', { name: 'Consent' }).click();
		await expect(rail(page)).toContainText('1 of 2');

		await revise(
			page,
			'A member may leave, and their share is settled in three months.',
			'a settlement window'
		);
		await expect(rail(page).getByRole('heading', { name: 'Responses to v2' })).toBeVisible();

		// v2 starts from nothing. The agreement was to v1's words.
		await expect(rail(page)).toContainText('nobody yet');
		await expect(rail(page)).toContainText('v1 held 1 consent — not carried, the text changed.');

		// Selecting v1 brings back v1's text and v1's count, together.
		await versions(page).getByRole('link', { name: 'v1' }).click();
		await expect(rail(page).getByRole('heading', { name: 'Responses to v1' })).toBeVisible();
		await expect(rail(page)).toContainText('1 of 2');
		await expect(rail(page)).toContainText('A member may leave at any time.');
		// …and says plainly that it is not the text on the table any more.
		await expect(rail(page)).toContainText('v2 is the later version');
	});

	test('a version is linkable, and an unknown one falls back rather than erroring', async ({
		page
	}) => {
		const fixture = await seedWithProposal(page);
		await revise(page, 'A second version.');

		const url = page.url().split('?')[0]!;

		await visit(page, `${url}?v=1`);
		await expect(rail(page).getByRole('heading', { name: 'Responses to v1' })).toBeVisible();

		// A stale link is a stale link, not an error page.
		await visit(page, `${url}?v=99`);
		await expect(rail(page).getByRole('heading', { name: 'Responses to v2' })).toBeVisible();

		await visit(page, url);
		await expect(rail(page).getByRole('heading', { name: 'Responses to v2' })).toBeVisible();
		expect(fixture.slug).toBeTruthy();
	});

	test('a thread with no proposal offers writing one instead of a second text box', async ({
		page
	}) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('What do we hold in common?');
		await page.getByRole('button', { name: 'Start' }).click();

		await expect(rail(page)).toContainText('No proposal on the table');
		await expect(rail(page)).toContainText('nothing yet');
		// The reply box is a reply box. It never doubles as the proposal editor.
		await expect(rail(page).getByRole('heading', { name: /^Responses to/ })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Write a proposal' })).toBeVisible();
	});
});

test.describe('the votes on a version, read together', () => {
	test('gathers every response into one block the counts point at', async ({ page }) => {
		await seedWithProposal(page);

		await rail(page)
			.getByPlaceholder('Add a reason — optional on all three…')
			.fill('It names who settles.');
		await rail(page).getByRole('button', { name: 'Consent' }).click();

		// The reason is a thing somebody said, so it reads in the conversation.
		await expect(page.getByText('It names who settles.').first()).toBeVisible();

		// Collapsed, the block summarises; expanded, it lists who said what.
		const block = page.locator('details').filter({ hasText: 'answered v1' });
		await expect(block).toContainText('1 of 2 answered v1');
		await block.locator('summary').click();
		await expect(block).toContainText('Consent');
	});

	test('opens and reads with JavaScript disabled', async ({ browser }) => {
		// `<details>` rather than a component, so the block is not a thing that
		// only works once a bundle has arrived.
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();

		const fixture = await seed(page);
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill(fixture.email);
		await page.getByLabel('Password').fill(fixture.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await page.goto(`/c/${fixture.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('Does this work without scripts?');
		await page.getByRole('button', { name: 'Start' }).click();

		// The composer's mode is in the URL, so switching to the proposal editor is
		// a link — the whole point of this test.
		await page.getByRole('link', { name: 'Revise the proposal' }).click();
		await page.getByLabel('The text a decision would adopt').fill('It does.');
		await page.getByRole('button', { name: /^Save as v/ }).click();
		await page.getByRole('button', { name: 'Consent' }).click();

		const block = page.locator('details').filter({ hasText: 'answered v1' });
		await expect(block).toBeVisible();
		// A `<details>` opens in the browser, not in the framework.
		await block.locator('summary').click();
		await expect(block).toContainText('Consent');

		await context.close();
	});
});

test.describe('freezing the version a community actually agreed on', () => {
	test('records an earlier version while a later one is on the table', async ({ page }) => {
		const fixture = await seedWithProposal(page);

		await rail(page).getByRole('button', { name: 'Consent' }).click();
		await revise(page, 'A version that draws objections.', 'tightened the window');

		// The steward goes back to the version the community agreed to.
		await versions(page).getByRole('link', { name: 'v1' }).click();
		await page.getByRole('button', { name: 'Freeze v1' }).click();

		const form = page.getByRole('region', { name: 'Freeze v1 into a decision' });
		// Said before the form is submitted: this is not the newest text.
		await expect(form).toContainText('v2 is the later version');
		await expect(form).toContainText('v1 of 2');

		await form.getByLabel('Mechanism').fill('consent');
		await form.getByRole('button', { name: 'Record decision' }).click();

		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/d/DEC-`));
		await expect(page.getByText('A member may leave at any time.')).toBeVisible();
	});

	test('marks the frozen version, and leaves the later one freezable', async ({ page }) => {
		const fixture = await seedWithProposal(page);
		const thread = page.url().split('?')[0]!;

		await revise(page, 'The later text.', 'reworded');
		await visit(page, `${thread}?v=1`);
		await page.getByRole('button', { name: 'Freeze v1' }).click();
		const form = page.getByRole('region', { name: 'Freeze v1 into a decision' });
		await form.getByLabel('Mechanism').fill('consent');
		await form.getByRole('button', { name: 'Record decision' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/d/DEC-`));

		// Back in the thread: v1 says it was recorded, and the argument continues.
		await visit(page, thread);
		await expect(page.getByText('The discussion is still open.')).toBeVisible();
		await expect(versions(page).getByRole('link', { name: /^v1/ })).toHaveAttribute(
			'title',
			/in force/
		);

		// v2 is still on the table and can still be recorded.
		await expect(page.getByRole('button', { name: 'Freeze v2' })).toBeVisible();
	});
});

test.describe('the linter, line by line', () => {
	test('annotates the version on the table and names the ambiguous middle', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('What do we expect of candidates?');
		await page.getByRole('button', { name: 'Start' }).click();

		// A rule and a value in one text — the case a whole-body type could not
		// express, and the one the linter now judges line by line.
		await page.getByRole('link', { name: 'Write a proposal' }).click();
		await expect(page.getByRole('button', { name: /^Save as v/ })).toBeVisible();
		await page
			.getByLabel('The text a decision would adopt')
			.fill(
				'Candidates become full members by a consent decision of the assembly, otherwise they remain candidates. Candidates are expected to show up with humility.'
			);
		await page.getByRole('button', { name: /^Save as v/ }).click();

		const linter = page.getByRole('region', { name: 'Linter on v1' });
		await expect(linter).toBeVisible();

		// The strongest job present, derived and shown — never chosen by anybody.
		await expect(linter).toContainText('Primary job');
		await expect(linter).toContainText('Enforceable');

		// The rule got the enforceable checks; the unlabelled line got the finding
		// the whole change exists for, with all three ways out and none preferred.
		await expect(linter).toContainText('Has a subject');
		await expect(linter).toContainText('The ambiguous middle');
		await expect(linter).toContainText(
			'Make it enforceable · Label it non-binding · Delete the line'
		);
	});

	test('keeps each version judged by the words it actually carries', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('Who settles what is owed?');
		await page.getByRole('button', { name: 'Start' }).click();

		await page.getByRole('link', { name: 'Write a proposal' }).click();
		await expect(page.getByRole('button', { name: /^Save as v/ })).toBeVisible();
		await page
			.getByLabel('The text a decision would adopt')
			.fill('Members are expected to settle up before they go.');
		await page.getByRole('button', { name: /^Save as v/ }).click();
		await expect(page.getByRole('region', { name: 'Linter on v1' })).toContainText(
			'The ambiguous middle'
		);

		// v2 answers the finding, and is judged on its own words.
		await revise(
			page,
			'Members must settle what is owed within three months, otherwise the departure is not recorded.',
			'named the window'
		);
		const v2 = page.getByRole('region', { name: 'Linter on v2' });
		await expect(v2).toBeVisible();
		await expect(v2).not.toContainText('The ambiguous middle');

		// And v1 still carries the verdict it was given — the result describes the
		// text it read, and is never recomputed by opening the page.
		await versions(page).getByRole('link', { name: 'v1' }).click();
		await expect(page.getByRole('region', { name: 'Linter on v1' })).toContainText(
			'The ambiguous middle'
		);
	});
});

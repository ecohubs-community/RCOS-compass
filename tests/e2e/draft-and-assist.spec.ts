import { expect, test } from '@playwright/test';
import { freezeOnOpenThread, proposeOnOpenThread, seed, signIn, visit } from './support.js';

/**
 * The two gaps between "built" and "usable": a draft nobody could edit, and the
 * two ✦ buttons that were drawn in the mockups and did nothing.
 *
 * Both are reached through the screens a member actually uses, because both
 * failed exactly there — the editor compiled and typechecked while sitting in a
 * branch of the page that no definition could ever be in.
 */

/** A definition with an adopted version, which is the only kind the app makes. */
async function definitionFrom(page: import('@playwright/test').Page, text: string) {
	const fixture = await seed(page);
	await signIn(page, fixture.email, fixture.password);

	await visit(page, `/c/${fixture.slug}/discussions`);
	await page.getByLabel('Start a discussion').fill('What do we hold in common?');
	await page.getByLabel('Clause (optional)').fill(fixture.clauseKey);
	await page.getByRole('button', { name: 'Start' }).click();
	await proposeOnOpenThread(page, text);
	await freezeOnOpenThread(page);
	await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/d/DEC-`));

	/**
	 * In through the standard browser, which is where a member finds an answered
	 * section — the decision page does not link to the definition it created, and
	 * there is no definitions index.
	 */
	await visit(page, `/c/${fixture.slug}/standard`);
	const href = await page
		.getByRole('link')
		.evaluateAll(
			(links) =>
				(links as HTMLAnchorElement[]).find((a) => /\/definitions\//.test(a.href))?.href ?? ''
		);
	expect(href, 'an answered section should link to its definition').not.toBe('');
	await visit(page, href);
	return fixture;
}

test.describe('writing a definition draft', () => {
	test('saves what was typed, and gives it back after a reload', async ({ page }) => {
		await definitionFrom(page, 'Land is held in common by the whole circle.');

		await expect(page.getByLabel('The text')).toBeVisible();
		await page
			.getByLabel('The text')
			.fill(
				'Members keep the common house quiet from 22:00, otherwise a steward asks them to stop.'
			);
		await page.getByLabel('In plain words').fill('Quiet after ten.');
		await page.getByRole('button', { name: 'Save the draft' }).click();
		await expect(page.getByRole('status')).toContainText('Saved');

		// It survives a reload, which is the whole point of a draft.
		const here = new URL(page.url());
		await visit(page, `${here.origin}${here.pathname}`);
		await expect(page.getByLabel('The text')).toHaveValue(/quiet from 22:00/);
		await expect(page.getByLabel('In plain words')).toHaveValue('Quiet after ten.');
	});

	test('offers the linter once there is something to judge', async ({ page }) => {
		await definitionFrom(page, 'Land is held in common by the whole circle.');

		await page.getByLabel('The text').fill('Members are expected to leave the place tidy.');
		await page.getByRole('button', { name: 'Save the draft' }).click();
		await expect(page.getByRole('status')).toContainText('Saved');

		await page.getByRole('button', { name: 'Run the linter' }).click();
		// The line binds somebody and offers nothing to check — the finding the
		// whole per-line change exists for.
		await expect(page.getByText('The ambiguous middle')).toBeVisible();
	});
});

test.describe('asking the thread for a suggestion', () => {
	test('reaches the action with an empty box, and degrades to a sentence', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('Does the button submit?');
		await page.getByRole('button', { name: 'Start' }).click();
		await page.getByLabel('Reply to the thread').fill('Something to read.');
		await page.getByRole('button', { name: 'Send' }).click();

		/**
		 * The box the ✦ button fills is `required`, so without `formnovalidate` the
		 * browser refuses the submit whenever it is empty — which is exactly when
		 * somebody asks for a suggestion. Posted directly here because the button
		 * itself is correctly hidden under `AI_PROVIDER=null`.
		 */
		const here = new URL(page.url());
		const posted = await page.request.post(`${here.origin}${here.pathname}?/suggest`, {
			headers: { origin: here.origin },
			form: { kind: 'summary' },
			maxRedirects: 0
		});

		// Reached, and answered with words rather than a stack trace. A SvelteKit
		// action failure is a 200 carrying the refusal, so the status the member
		// gets is in the body: with no provider the suggestion degrades to a
		// sentence, never to a guess.
		expect(posted.status()).toBe(200);
		const body = await posted.text();
		expect(body).toContain('"status":409');
		expect(body).toMatch(/not switched on/i);
	});

	test('does not offer the buttons when there is no provider', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('Nothing to suggest with.');
		await page.getByRole('button', { name: 'Start' }).click();

		await expect(page.getByRole('button', { name: /Summarise this thread/ })).toHaveCount(0);
	});
});

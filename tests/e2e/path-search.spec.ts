import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * P5's exit criteria. `openspec/changes/path-glossary-search`.
 *
 *     a day-one community answers the interview → gets an order it can see the
 *     reasons for → and the water-pump question is answered with citations
 *
 * Written before any of it exists and marked `fixme` until it passes, the way
 * P3's and P4's were.
 *
 * Two claims it is here to keep honest. The ordering has to be **arguable**: a
 * member can see which input put an item where it is, and change it. And the
 * reverse lookup has to **cite rather than answer** — it returns the clauses and
 * decisions that govern a question and no sentence of ours, which is the
 * difference between the feature the MVP ships and the one §1.3 promises never
 * to build. It runs on `AI_PROVIDER=null`, because none of this is an AI feature.
 */

test.describe('a community that needs to know what to do first', () => {
	test.fixme(true, 'P5 group 8 — nothing is built yet');

	test('answers the interview and gets an order it can argue with', async ({ page }) => {
		test.slow();

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		// --- before the interview -----------------------------------------------
		await visit(page, `/c/${slug}/path`);
		// A community that has told us nothing is told that, rather than being
		// left to assume the list is tailored to it.
		await expect(page.getByText(/not tailored|structural/i)).toBeVisible();

		// --- the interview ------------------------------------------------------
		await page
			.getByRole('link', { name: /answer|interview|tailor/i })
			.first()
			.click();

		// Each answer says what it moves, as it is answered.
		await page.getByRole('group', { name: /land/i }).getByRole('radio', { name: 'Yes' }).check();
		await expect(page.getByText(/moves up|because you hold land/i)).toBeVisible();

		await page.getByRole('button', { name: /save|done|finish/i }).click();

		// --- an order with reasons ----------------------------------------------
		await visit(page, `/c/${slug}/path`);
		const items = page.getByRole('listitem');
		await expect(items.first()).toBeVisible();

		// Every item says why it is where it is, and the top one's reason names
		// an input that actually moved it.
		const first = items.first();
		await expect(first).toContainText(/because|waiting on|nothing else/i);

		// --- and it can be argued with ------------------------------------------
		await visit(page, `/c/${slug}/path/settings`);
		await expect(page.getByLabel(/dependency/i)).toBeVisible();
		await expect(page.getByLabel(/risk/i)).toBeVisible();
		// The weights are the community's, and it can see they are the defaults.
		await expect(page.getByText(/default/i)).toBeVisible();
	});

	test('answers the water-pump question with citations and nothing else', async ({ page }) => {
		test.slow();

		const { slug, email, password, clauseKey } = await seed(page);
		await signIn(page, email, password);

		// A decision about spending, recorded the ordinary way.
		await visit(page, `/c/${slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('What can we spend without asking?');
		await page.getByLabel('Clause (optional)').fill(clauseKey);
		await page.getByRole('button', { name: 'Start' }).click();
		await page
			.getByLabel('Write a proposal', { exact: false })
			.fill(
				'Any spend over €500 needs a consent decision of the assembly. Below that a steward may decide alone.'
			);
		await page.getByRole('button', { name: 'Post proposal' }).click();
		await page.getByRole('button', { name: 'Freeze', exact: true }).click();
		const form = page.getByRole('region', { name: 'Record this decision' });
		await form.getByLabel('Mechanism').fill('consent');
		await form.getByRole('button', { name: 'Record decision' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${slug}/d/DEC-`));

		// --- the question, in a member's own words ------------------------------
		await visit(page, `/c/${slug}/search`);
		await page.getByLabel(/search|question/i).fill('can we spend €800 on the water pump?');
		await page.getByRole('button', { name: /search|ask/i }).click();

		// It cites: the decision that governs spending, by its reference.
		await expect(page.getByRole('link', { name: /^DEC-\d{4}-\d{3}$/ })).toBeVisible();
		await expect(page.getByText(/over €500 needs a consent decision/i)).toBeVisible();

		// And it does not answer. No sentence of ours telling them whether they may.
		await expect(page.getByText(/^(yes|no),? you (can|may|cannot|may not)/i)).toHaveCount(0);
	});

	test('a member of another community finds none of it', async ({ page }) => {
		test.slow();

		const theirs = await seed(page);
		await signIn(page, theirs.email, theirs.password);
		await visit(page, `/c/${theirs.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('Pump money');
		await page.getByLabel('Clause (optional)').fill(theirs.clauseKey);
		await page.getByRole('button', { name: 'Start' }).click();

		// A second community, with the same words in play.
		const ours = await seed(page);
		await signIn(page, ours.email, ours.password);
		await visit(page, `/c/${ours.slug}/search`);
		await page.getByLabel(/search|question/i).fill('pump money');
		await page.getByRole('button', { name: /search|ask/i }).click();

		await expect(page.getByText('Pump money')).toHaveCount(0);
	});
});

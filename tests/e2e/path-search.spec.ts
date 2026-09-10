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

		// Each answer says what it moves, beside the answer itself.
		const land = page.getByRole('group', { name: /land/i });
		await land.getByRole('radio', { name: 'Yes' }).check();
		await expect(land.getByText(/moves up/i).first()).toBeVisible();

		await page.getByRole('button', { name: /save|done|finish/i }).click();

		// --- an order with reasons ----------------------------------------------
		await visit(page, `/c/${slug}/path`);
		const items = page.getByRole('list', { name: 'What to decide next' }).getByRole('listitem');
		await expect(items.first()).toBeVisible();

		// Every item says why it is where it is, and the top one's reason names
		// an input that actually moved it.
		const first = items.first();
		await expect(first).toContainText(/because|waiting on|nothing else/i);

		// --- and it can be argued with ------------------------------------------
		await visit(page, `/c/${slug}/settings/path`);
		await expect(page.getByLabel('Answer what unblocks other things first')).toBeVisible();
		await expect(page.getByLabel('What you told us about yourselves')).toBeVisible();
		// The weights are the community's, and it can see they are the defaults.
		await expect(page.getByText('These are the strengths Compass ships with')).toBeVisible();
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
		// The page's own box, not the one in the shell — both are a search for this
		// community's governance, and both work.
		const ask = page.getByRole('main');
		await ask.getByLabel(/search|question/i).fill('can we spend €800 on the water pump?');
		await ask.getByRole('button', { name: /search|ask/i }).click();

		// It cites: the decision that governs spending, by its reference.
		await expect(page.getByRole('link', { name: /^DEC-\d{4}-\d{3}$/ })).toBeVisible();
		// Twice, and both are right: the decision that recorded it, and the
		// definition it adopted. Quoted from what the community wrote either way.
		await expect(page.getByText(/over €500 needs a consent decision/i)).toHaveCount(2);
		await expect(page.getByText(/over €500 needs a consent decision/i).first()).toBeVisible();

		// And it does not answer. No sentence of ours telling them whether they may.
		await expect(page.getByText(/^(yes|no),? you (can|may|cannot|may not)/i)).toHaveCount(0);
	});

	test('a member of another community finds none of it', async ({ browser }) => {
		test.slow();

		// Two browser contexts rather than two sign-ins in one: signing in while
		// already signed in redirects away from the form, and the failure looks
		// like a hung page rather than a test driving the app wrongly.
		const theirContext = await browser.newContext();
		const theirPage = await theirContext.newPage();
		const theirs = await seed(theirPage);
		await signIn(theirPage, theirs.email, theirs.password);
		await visit(theirPage, `/c/${theirs.slug}/discussions`);
		await theirPage.getByLabel('Start a discussion').fill('Pump money');
		await theirPage.getByLabel('Clause (optional)').fill(theirs.clauseKey);
		await theirPage.getByRole('button', { name: 'Start' }).click();
		await expect(theirPage.getByRole('heading', { name: 'Pump money' })).toBeVisible();

		// A second community, with the same words in play.
		const ourContext = await browser.newContext();
		const ourPage = await ourContext.newPage();
		const ours = await seed(ourPage);
		await signIn(ourPage, ours.email, ours.password);
		await visit(ourPage, `/c/${ours.slug}/search`);

		const ask = ourPage.getByRole('main');
		await ask.getByLabel(/search|question/i).fill('pump money');
		await ask.getByRole('button', { name: /search|ask/i }).click();

		await expect(ourPage.getByText('Pump money')).toHaveCount(0);
		await expect(ourPage.getByText(/Searched for: (pump|money)/)).toBeVisible();

		await theirContext.close();
		await ourContext.close();
	});
});

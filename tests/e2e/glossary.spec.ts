import { expect, test } from '@playwright/test';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { seed, signIn, visit } from './support';

/**
 * The clause the "Commons" term is answered by, derived rather than written
 * here — a hardcoded key would break the first time RCOS renumbers, and for a
 * reason nobody would expect.
 */
const view = getStandard('rcos-core', '0.1');
const COMMONS = view.glossary.find((term) => term.key === 'commons')!;
const COMMONS_CLAUSE = view
	.countableClauses()
	.find((clause) => clause.owner === COMMONS.definedBy)!;

/**
 * The glossary, and the panel that opens over whatever you were reading.
 * UI spec §4.8.
 *
 * The integration suite proves the join. What it cannot prove is that a member
 * meets a term where they hit it, and that the page still works when the panel
 * does not — every one of those links is a real link first.
 */
test.describe('the glossary nobody maintains', () => {
	test('lists the standard beside the community, and says which is which', async ({ page }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/glossary`);

		await expect(page.getByRole('heading', { name: 'Glossary' })).toBeVisible();
		// A day-one community has defined none of them, and is told that rather
		// than shown a column of blanks.
		await expect(page.getByText('This community has not defined this yet').first()).toBeVisible();
		await expect(
			page
				.getByText('A word for talking about the standard, not something a community defines')
				.first()
		).toBeVisible();
	});

	test('changes when a definition is frozen, with nobody updating a glossary', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		// On the clause the term is answered by, so the glossary has somewhere to
		// put the answer. Any other clause would prove the freeze and nothing else.
		await visit(page, `/c/${fixture.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('What do we hold in common?');
		await page.getByLabel('Clause (optional)').fill(COMMONS_CLAUSE.key);
		await page.getByRole('button', { name: 'Start' }).click();
		await page
			.getByLabel('Write a proposal', { exact: false })
			.fill('Land and buildings are held in common by the whole circle.');
		await page.getByRole('button', { name: 'Post proposal' }).click();

		await page.getByRole('button', { name: 'Freeze', exact: true }).click();
		const form = page.getByRole('region', { name: 'Record this decision' });
		await form.getByLabel('Mechanism').fill('consent');
		await form.getByRole('button', { name: 'Record decision' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/d/DEC-\\d{4}-\\d{3}$`));

		await visit(page, `/c/${fixture.slug}/glossary`);
		await expect(
			page.getByText('Land and buildings are held in common by the whole circle.')
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Where this was decided' }).first()).toBeVisible();
	});

	test('opens over the standard browser, and the link works on its own', async ({ page }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/standard`);

		const term = page.getByRole('link', { name: 'Commons', exact: true }).first();
		await expect(term).toBeVisible();

		// The panel intercepts the click; the term arrives without leaving the page.
		await term.click();
		const panel = page.getByRole('dialog', { name: 'Glossary term' });
		await expect(panel).toBeVisible();
		await expect(panel.getByRole('heading', { name: 'Commons' })).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/c/${slug}/standard$`));

		await page.keyboard.press('Escape');
		await expect(panel).toBeHidden();

		// And the same link is a real one: its href lands on the term's own place
		// in the glossary, which is what happens with no JavaScript at all.
		const href = await term.getAttribute('href');
		expect(href).toBe(`/c/${slug}/glossary#commons`);
	});
});

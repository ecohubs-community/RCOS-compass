import { expect, test, type Page } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * The loop that is the product. `docs/06-testing-strategy.md` §7.
 *
 *     see the gap → discuss it → decide it → find it again later
 *
 * Written before any of it existed and marked `fixme` while it could not pass;
 * the `fixme` came off when it did. That is the whole point of having written it
 * first: "nearly done" was a claim anyone could check.
 *
 * Every step goes through the screens a member actually uses. Nothing here calls
 * a service directly, and nothing asserts a database row — if the loop works
 * only when driven from the inside, it does not work.
 */

test.describe('the core loop, on a fresh community', () => {
	test('see the gap, discuss it, decide it, and find it again', async ({ page }) => {
		const { slug, email, password, clauseKey } = await seed(page);
		await signIn(page, email, password);

		// --- see the gap -------------------------------------------------------
		await page.goto(`/c/${slug}`);
		const next = page.getByRole('region', { name: 'Your next 5' });
		await expect(next.getByRole('listitem')).toHaveCount(5);

		// A fresh community has answered nothing. Scoped to the dashboard's own
		// section: the sidebar carries the same figure under the same name, and
		// only above 1024px — reading it unscoped passed on desktop and found
		// nothing on a phone.
		const readinessOf = (p: Page) =>
			p.getByRole('region', { name: 'Readiness' }).getByRole('progressbar', { name: 'Readiness' });
		await expect(readinessOf(page)).toHaveAttribute('aria-valuenow', '0');

		// The questions are plain language, not clause text: no row is a bare ref.
		const firstQuestion = await next.getByRole('heading').first().innerText();
		expect(firstQuestion).not.toMatch(/^\d+(\.\d+)+$/);

		// "Start discussion" starts one, with the clause already chosen. It used to
		// land on the standard browser, which has no form on it — the first step of
		// the loop, pointed at a reference page.
		await next.getByRole('link', { name: 'Start discussion' }).first().click();
		await expect(page).toHaveURL(/\/discussions\?clause=/);
		await expect(page.getByLabel('Clause (optional)')).not.toHaveValue('');

		// --- discuss it --------------------------------------------------------
		await page.goto(`/c/${slug}/standard`);
		const anySection = page.getByRole('listitem').first();
		await expect(anySection).toBeVisible();

		await visit(page, `/c/${slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('Can someone leave at any time?');
		// The clause a definition would answer, taken from the standard by the seed
		// rather than written here — a hardcoded ref would break the first time
		// RCOS renumbers, and for a reason nobody would expect.
		await page.getByLabel('Clause (optional)').fill(clauseKey);
		await page.getByRole('button', { name: 'Start' }).click();

		await expect(
			page.getByRole('heading', { name: 'Can someone leave at any time?' })
		).toBeVisible();

		await page
			.getByLabel('Write a proposal', { exact: false })
			.fill(
				'A member may leave at any time by telling a steward, and their share is settled within 30 days.'
			);
		await page.getByRole('button', { name: 'Post proposal' }).click();
		await expect(page.getByText('Proposal v1')).toBeVisible();

		// The linter is advice, and it is visible.
		await expect(page.getByRole('heading', { name: 'Definition linter' })).toBeVisible();

		// --- decide it ---------------------------------------------------------
		await page.getByRole('button', { name: 'Freeze', exact: true }).click();
		const form = page.getByRole('region', { name: 'Record this decision' });

		// A fresh community has no Decision Matrix, and is told so *before* it
		// confirms rather than afterwards.
		await expect(form.getByText(/recorded as\s+Provisional/i)).toBeVisible();

		await form.getByLabel('Mechanism').fill('consent');
		await form.getByLabel('Who was present').fill('9');
		await form.getByLabel('In favour').fill('9');
		await form.getByLabel('Rationale').fill('Agreed at the Tuesday meeting.');
		await form.getByRole('button', { name: 'Record decision' }).click();

		// --- what the freeze produced -------------------------------------------
		await expect(page).toHaveURL(new RegExp(`/c/${slug}/d/DEC-\\d{4}-\\d{3}$`));
		const reference = page.url().split('/').at(-1)!;
		expect(reference).toMatch(/^DEC-\d{4}-\d{3}$/);

		await expect(page.getByText('Provisional')).toBeVisible();
		await expect(
			page.getByText('A member may leave at any time by telling a steward', { exact: false })
		).toBeVisible();

		// Readiness moved. It is a proportion of 173 countable clauses, so one
		// answered section is a small number — but it is not zero, and the bar and
		// the artifact count agree with each other.
		await page.goto(`/c/${slug}`);
		const moved = Number(await readinessOf(page).getAttribute('aria-valuenow'));
		expect(moved).toBeGreaterThan(0);

		// And the layer that moved is the only one that moved: one answered section
		// sits in one artifact, which sits in one layer.
		const layerBars = page.getByRole('progressbar', { name: /^Layer / });
		const percents = await Promise.all(
			(await layerBars.all()).map(async (bar) => Number(await bar.getAttribute('aria-valuenow')))
		);
		expect(percents.length).toBeGreaterThan(0);
		expect(percents.filter((percent) => percent > 0)).toHaveLength(1);

		// --- find it again later -------------------------------------------------
		// The register's reverse lookup: a member remembers the question, not the
		// number.
		await visit(page, `/c/${slug}/decisions`);
		await page.getByLabel('Search decisions by what they say').fill('leave at any time');
		await page.getByRole('button', { name: 'Search' }).click();
		await expect(page.getByRole('link', { name: reference })).toBeVisible();

		// The permalink resolves on its own, quoted out of context.
		await page.goto(`/c/${slug}/d/${reference}`);
		await expect(
			page.getByRole('heading', { name: 'Can someone leave at any time?' })
		).toBeVisible();
	});

	test('the same loop at 375px, including a consent round and the freeze', async ({ page }) => {
		// docs/06 §7: mobile is a supported surface, not a read-only one. The
		// triad becomes toggles below 1024px and that is where it would break.
		await page.setViewportSize({ width: 375, height: 812 });

		const { slug, email, password, clauseKey } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('What happens when someone stops showing up?');
		await page.getByLabel('Clause (optional)').fill(clauseKey);
		await page.getByRole('button', { name: 'Start' }).click();

		await page
			.getByLabel('Write a proposal', { exact: false })
			.fill(
				'A steward checks in after four weeks of absence, and the assembly decides after eight.'
			);
		await page.getByRole('button', { name: 'Post proposal' }).click();
		await expect(page.getByText('Proposal v1')).toBeVisible();

		// A consent round, on a phone, because that is where a steward opens one.
		await page.getByLabel('Open a consent round for (days)').fill('7');
		await page.getByRole('button', { name: 'Open a round' }).click();
		const round = page.getByRole('region', { name: 'Consent round open' });
		await expect(round).toBeVisible();

		await round.getByLabel('Your response').selectOption('consent');
		await round.getByRole('button', { name: 'Respond' }).click();
		await expect(round).toContainText('1 of 2 responded');

		await page.getByRole('button', { name: 'Freeze', exact: true }).click();
		const form = page.getByRole('region', { name: 'Record this decision' });

		// The round informs the record and does not write it: the tally arrives
		// pre-filled, and a person still has to press the button.
		await expect(form.getByLabel('Who was present')).toHaveValue('1');
		await expect(form.getByLabel('In favour')).toHaveValue('1');

		await form.getByLabel('Mechanism').fill('consent');
		await form.getByRole('button', { name: 'Record decision' }).click();

		await expect(page).toHaveURL(new RegExp(`/c/${slug}/d/DEC-`));
	});

	test('a member sees the same loop and cannot record the decision', async ({ page }) => {
		// docs/04 §1: a member may do everything that produces a proposal, and
		// nothing that produces authority.
		const seeded = await seed(page);
		await signIn(page, seeded.member.email, seeded.member.password);

		await visit(page, `/c/${seeded.slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('Should we keep chickens?');
		await page.getByLabel('Clause (optional)').fill(seeded.clauseKey);
		await page.getByRole('button', { name: 'Start' }).click();

		await page.getByLabel('Write a proposal', { exact: false }).fill('Chickens are allowed.');
		await page.getByRole('button', { name: 'Post proposal' }).click();
		await expect(page.getByText('Proposal v1')).toBeVisible();

		// The button is not offered…
		await expect(page.getByRole('button', { name: 'Freeze', exact: true })).toHaveCount(0);

		// …and the action refuses anyway, because a hidden button is not a control.
		const refused = await page.request.post(`${page.url()}?/freeze`, {
			headers: { origin: new URL(page.url()).origin },
			form: {
				idempotencyKey: 'member-tries-anyway',
				title: 'Chickens',
				type: 'operational',
				mechanism: 'consent'
			},
			maxRedirects: 0
		});
		expect(refused.status()).toBe(403);
	});
});

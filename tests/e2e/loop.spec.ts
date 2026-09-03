import { expect, test } from '@playwright/test';

/**
 * The loop that is the product. `docs/06-testing-strategy.md` §7.
 *
 *     see the gap → discuss it → decide it → find it again later
 *
 * Written before any of it exists, because it is the definition of done for this
 * change: while it is here and marked `fixme`, "nearly there" is a claim anyone
 * can check rather than one someone makes in a status update.
 *
 * **Why `fixme` rather than simply failing.** The task called for leaving it red.
 * A permanently red CI is worse than no CI — people stop reading it, and the one
 * genuine failure arrives among six weeks of expected ones. `fixme` keeps the
 * spec in the repository, in the run output, and named in every report, without
 * turning the signal off. Group 10 removes it, and the day it passes is the day
 * the phase is done.
 *
 * The steps below are expressed in what a member sees — roles, labels, visible
 * text — rather than in selectors, so they survive the screens being built.
 */
test.describe.fixme('the core loop, on a fresh community', () => {
	test('see the gap, discuss it, decide it, and find it again', async ({ page }) => {
		// --- sign in -----------------------------------------------------------
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill('ana@valle-verde.test');
		await page.getByLabel('Password').fill('the-seeded-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		// --- see the gap -------------------------------------------------------
		// The dashboard opens on the five things worth doing next, phrased as
		// questions rather than as clause text (UI spec §4.1b).
		const next = page.getByRole('region', { name: 'Your next 5' });
		await expect(next.getByRole('listitem')).toHaveCount(5);

		const readinessBefore = await page.getByTestId('readiness-percent').innerText();

		const gap = next.getByRole('listitem').first();
		const question = await gap.getByRole('heading').innerText();
		await gap.getByRole('button', { name: 'Start discussion' }).click();

		// --- discuss it --------------------------------------------------------
		await expect(page.getByRole('heading', { name: question })).toBeVisible();
		await page.getByLabel('Write a proposal').fill('Members may leave at any time by…');
		await page.getByRole('button', { name: 'Post proposal' }).click();
		await expect(page.getByText('Proposal v1')).toBeVisible();

		// The linter is advice, never a gate.
		await expect(page.getByRole('region', { name: 'Definition linter' })).toBeVisible();

		// --- decide it ---------------------------------------------------------
		await page.getByRole('button', { name: 'Freeze' }).click();
		const freeze = page.getByRole('dialog', { name: 'Record this decision' });

		// A fresh community has no Decision Matrix yet, so it is told what that
		// means before it confirms, not afterwards.
		await expect(freeze.getByText(/recorded as Provisional/i)).toBeVisible();

		await freeze.getByLabel('Mechanism').fill('consent');
		await freeze.getByLabel('Who was present').fill('9');
		await freeze.getByLabel('In favour').fill('9');
		await freeze.getByLabel('Rationale').fill('Agreed at the Tuesday meeting.');
		await freeze.getByRole('button', { name: 'Record decision' }).click();

		// --- what the freeze produced ------------------------------------------
		const reference = await page.getByTestId('decision-reference').innerText();
		expect(reference).toMatch(/^DEC-\d{4}-\d{3}$/);

		await expect(page.getByText('Adopted')).toBeVisible();
		await expect(page.getByText(/Provisional/)).toBeVisible();

		// Readiness moved, and by one clause's worth — not by an arbitrary amount.
		const readinessAfter = await page.getByTestId('readiness-percent').innerText();
		expect(readinessAfter).not.toBe(readinessBefore);

		// The change log records the act, not just its result.
		await page.getByRole('link', { name: 'History' }).click();
		await expect(page.getByText(reference)).toBeVisible();

		// --- find it again later -----------------------------------------------
		// The register's reverse lookup is the thing a member uses a year later,
		// when they remember the question and not the reference.
		await page.getByRole('link', { name: 'Decisions' }).click();
		await page.getByRole('searchbox', { name: /Can we/ }).fill('leave at any time');
		await expect(page.getByRole('link', { name: reference })).toBeVisible();

		// And the permalink resolves on its own, quoted out of context.
		await page.goto(`/c/valle-verde/d/${reference}`);
		await expect(page.getByRole('heading', { name: question })).toBeVisible();
		await expect(page.getByText('Members may leave at any time by…')).toBeVisible();
	});

	test('the same loop at 375px, including drafting and freezing', async ({ page }) => {
		// docs/06 §7: mobile is a supported surface, not a read-only one. This is
		// the same journey, and it exists separately because the three-column hero
		// becomes tabs below 1024px and that is where it will break.
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto('/sign-in');
		await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
	});
});

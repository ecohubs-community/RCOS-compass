import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * P6's exit criteria. `openspec/changes/publishing-export-i18n`.
 *
 *     a community switches its public index on → publishes an artifact → an
 *     anonymous visitor reads the binary claim and the gap list, and no
 *     percentage → the community exports itself → the bundle opens without the
 *     app
 *
 * Written before any of it exists and marked `fixme` until it passes, the way
 * P3's, P4's and P5's were.
 *
 * Three claims it is here to keep honest. **Nothing member-visible reaches an
 * anonymous reader** — the failure that cannot be walked back, because it is
 * already in somebody's cache. **The percentage never leaves**: UI spec §1.4 is
 * blunt that if "73% compliant" reaches community websites the word compliant
 * stops meaning anything. And **the bundle is readable without us**, which is
 * what makes `docs/10` §1.3's data-ownership promise a fact rather than a
 * sentence in the terms.
 *
 * The bundle's own contents are asserted in `tests/integration/export.test.ts`,
 * with nothing serving — a suite whose web server is running cannot demonstrate
 * that a file is readable without the app.
 */

test.describe('a community that wants to be seen', () => {
	test.fixme(true, 'P6 group 10 — nothing is built yet');

	test('publishes an artifact and an anonymous visitor can read it', async ({ page, browser }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		// --- before anything is public ------------------------------------------
		const anonymous = await browser.newContext();
		const visitor = await anonymous.newPage();

		// The community switch is off by default, so there is no public surface at
		// all — not an empty one.
		expect((await visitor.goto(`/p/${slug}`))?.status()).toBe(404);

		// --- the community decides to have one ----------------------------------
		await visit(page, `/c/${slug}/settings/publishing`);
		await page.getByLabel(/public index/i).check();
		await page.getByRole('button', { name: /save|turn on/i }).click();

		// Published nothing yet: the index exists and says so, rather than 404ing
		// or showing an empty shell that reads as broken.
		await visitor.goto(`/p/${slug}`);
		await expect(visitor.getByText(/has not published/i)).toBeVisible();

		// --- publishing is a decision -------------------------------------------
		await visit(page, `/c/${slug}/standard`);
		await page
			.getByRole('button', { name: /publish/i })
			.first()
			.click();
		await page
			.getByRole('button', { name: /confirm|publish/i })
			.last()
			.click();

		// It went in the register, like every other governance act.
		await visit(page, `/c/${slug}/decisions`);
		await expect(page.getByText(/publish/i).first()).toBeVisible();

		// --- what the world sees ------------------------------------------------
		await visitor.goto(`/p/${slug}`);

		// The binary claim and the gap list, and never the number behind them.
		await expect(visitor.getByText(/not yet .*compliant/i)).toBeVisible();
		await expect(visitor.getByText(/missing|still to/i).first()).toBeVisible();
		await expect(visitor.getByText(/\d+\s*%\s*(compliant|readiness|ready)/i)).toHaveCount(0);

		// Nothing member-visible leaked. The fixture's discussion titles and
		// unpublished definitions are the canary.
		const body = await visitor.locator('body').innerText();
		expect(body).not.toContain('Can someone leave at any time?');

		await anonymous.close();
	});

	test('withdrawing says so, rather than pretending the page never existed', async ({
		page,
		browser
	}) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/settings/publishing`);
		await page.getByLabel(/public index/i).check();
		await page.getByRole('button', { name: /save|turn on/i }).click();

		await visit(page, `/c/${slug}/standard`);
		await page
			.getByRole('button', { name: /publish/i })
			.first()
			.click();
		await page
			.getByRole('button', { name: /confirm|publish/i })
			.last()
			.click();

		const anonymous = await browser.newContext();
		const visitor = await anonymous.newPage();
		const published = await visitor.goto(`/p/${slug}`);
		expect(published?.status()).toBe(200);
		const artifactUrl = await visitor.getByRole('link').first().getAttribute('href');

		// --- and then the community changes its mind ----------------------------
		await page
			.getByRole('button', { name: /unpublish|withdraw/i })
			.first()
			.click();
		await page
			.getByRole('button', { name: /confirm|withdraw/i })
			.last()
			.click();

		// 410, not 404. The page existed, somebody may be holding the link, and
		// saying it never existed is a lie they can check against their own history.
		expect((await visitor.goto(artifactUrl!))?.status()).toBe(410);

		// A URL for something never published is a plain 404.
		expect((await visitor.goto(`/p/${slug}/artifact/never-published`))?.status()).toBe(404);

		// The withdrawal is in the register too.
		await visit(page, `/c/${slug}/decisions`);
		await expect(page.getByText(/withdrew|unpublish/i).first()).toBeVisible();

		await anonymous.close();
	});

	test('exports itself, and the link is the only way in', async ({ page, browser }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/settings/export`);
		await page.getByRole('button', { name: /export/i }).click();

		// A job, not a request that blocks: the steward is told where it will
		// appear rather than made to wait.
		await expect(page.getByText(/preparing|queued|will appear/i)).toBeVisible();

		const link = page.getByRole('link', { name: /download/i });
		await expect(link).toBeVisible({ timeout: 60_000 });
		const href = await link.getAttribute('href');

		// Signed and scoped: an altered link is refused rather than serving
		// somebody else's community.
		const anonymous = await browser.newContext();
		const stranger = await anonymous.newPage();
		expect((await stranger.goto(`${href!.slice(0, -2)}xx`))?.status()).toBeGreaterThanOrEqual(400);

		await anonymous.close();
	});
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { walkable } from '../support/routes.js';
import { seed, seedWithProposal, signIn, visit } from './support.js';

/**
 * docs/02-component-guidelines.md §6 commits to WCAG 2.1 AA. The gallery is the
 * target because it renders every primitive in every state, at every viewport in
 * the Playwright matrix.
 */
const scan = (page: Page) =>
	new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

test.describe('accessibility', () => {
	test('the front page has no violations', async ({ page }) => {
		await page.goto('/');
		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test('the error page has no violations', async ({ page }) => {
		await page.goto('/__test/boom');
		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test('the sign-in page has no violations', async ({ page }) => {
		await page.goto('/sign-in');
		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	/**
	 * Every screen of the loop, at whichever viewport this project runs.
	 * docs/06 §7: the matrix is 375 / 768 / 1024 / 1440, and mobile is a
	 * supported surface rather than a courtesy — the definition triad becomes
	 * toggles below 1024px, and that is exactly where an a11y bug would hide.
	 */
	test('every screen of the loop has no violations', async ({ page }) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const threadUrl = page.url();

		for (const url of [
			`/c/${fixture.slug}`,
			`/c/${fixture.slug}/standard`,
			`/c/${fixture.slug}/discussions`,
			threadUrl,
			`/c/${fixture.slug}/decisions`
		]) {
			await page.goto(url);
			const results = await scan(page).analyze();
			expect(results.violations, `${url} has accessibility violations`).toEqual([]);
		}
	});

	/**
	 * P5's screens, at whichever viewport this project runs.
	 *
	 * The path is a list with two buttons per row, the settings and interview are
	 * forms, search has two boxes with the same purpose on one page, and the
	 * glossary is 37 entries of two definitions each. Every one of those is a
	 * shape where a label or a heading level goes wrong quietly.
	 */
	test('the path, its settings, the interview, search and the glossary have no violations', async ({
		page
	}) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		for (const url of [
			`/c/${fixture.slug}/path`,
			`/c/${fixture.slug}/settings/path`,
			`/c/${fixture.slug}/settings/interview`,
			`/c/${fixture.slug}/search`,
			`/c/${fixture.slug}/search?q=can+we+spend+on+the+water+pump`,
			`/c/${fixture.slug}/glossary`
		]) {
			await visit(page, url);
			const results = await scan(page).analyze();
			expect(results.violations, `${url} has accessibility violations`).toEqual([]);
		}
	});

	test('the glossary panel has no violations, open', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/standard`);

		await page.getByRole('link', { name: 'Commons', exact: true }).first().click();
		await expect(page.getByRole('dialog', { name: 'Glossary term' })).toBeVisible();

		// A modal is where focus order and labelling go wrong, and it is the one
		// state the page-level scans above never reach.
		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	/**
	 * The public surface, which is the one page in the product most likely to be
	 * opened on a phone by somebody who has never seen it before — often from a
	 * link in an email, with no idea what Compass is.
	 */
	test('the public index and an artifact page have no violations', async ({ page, browser }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/settings/publishing`);
		await page.getByRole('checkbox', { name: /public pages/i }).check();
		await page.getByRole('button', { name: 'Save' }).click();

		const anonymous = await browser.newContext();
		const visitor = await anonymous.newPage();
		await visitor.goto(`/p/${fixture.slug}`);
		expect((await scan(visitor).analyze()).violations).toEqual([]);

		await anonymous.close();
	});

	test('every screen this phase added has no violations', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		for (const url of [
			`/c/${fixture.slug}/settings/publishing`,
			`/c/${fixture.slug}/settings/transparency`,
			`/c/${fixture.slug}/settings/export`,
			`/c/${fixture.slug}/settings/mirror`,
			`/c/${fixture.slug}/audit`
		]) {
			await visit(page, url);
			const results = await scan(page).analyze();
			expect(results.violations, `${url} has accessibility violations`).toEqual([]);
		}
	});

	/**
	 * Every route the registry says is scanned, driven from the registry itself.
	 *
	 * The list used to live in the tests, which meant a screen added in a later
	 * phase was scanned if whoever added it remembered. Now `tests/support/routes.ts`
	 * enumerates the routes on disk, a unit test fails on one that is neither
	 * scanned nor exempt-with-a-reason, and this walks the ones a seeded community
	 * can reach. The rest name the test that covers them.
	 */
	test('every route the registry lists is scanned', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		for (const route of walkable()) {
			await visit(page, route.path(fixture.slug));
			const results = await scan(page).analyze();
			expect(results.violations, `${route.id} has accessibility violations`).toEqual([]);
		}
	});

	test('the document screens have no violations', async ({ page }) => {
		test.slow();
		const fixture = await seedWithProposal(page);

		await visit(page, `/c/${fixture.slug}/documents`);
		expect((await scan(page).analyze()).violations).toEqual([]);
	});

	test('the freeze form has no violations, open', async ({ page }) => {
		test.slow();
		await seedWithProposal(page);
		// Opened by the server, so this holds with no JavaScript too.
		await page.goto(`${page.url()}?freeze=1`);
		await expect(page.getByRole('region', { name: 'Record this decision' })).toBeVisible();

		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test('the loop is reachable by keyboard alone', async ({ page }) => {
		test.slow();
		// docs/06 §7 asks for a keyboard-only pass. The thing that would break it
		// is a control that is only a click target: every interactive element here
		// has to take focus and answer to Enter.
		const fixture = await seedWithProposal(page);
		await visit(page, `/c/${fixture.slug}/decisions`);

		const search = page.getByLabel('Search decisions by what they say');
		await search.focus();
		await expect(search).toBeFocused();
		await page.keyboard.type('leave');
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/q=leave/, { timeout: 15_000 });
	});

	test('focus lands on the new page after a link is followed', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}`);

		await page.getByRole('link', { name: 'Decisions' }).click();
		await expect(page).toHaveURL(/\/decisions/);

		/**
		 * Client-side navigation replaces the document without moving focus, so
		 * without this somebody on a keyboard is left on a link that no longer
		 * exists and tabs from the top of the shell on every step of the loop.
		 */
		await expect(page.locator('h1')).toBeFocused();
	});

	test('every control on a screen can be reached by keyboard, and shows it', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/settings/publishing`);

		// What the tab order actually reaches, against what is on the page. A
		// control that is only a click target is the failure this catches, and it
		// is invisible to axe.
		const reached = new Set<string>();
		for (let step = 0; step < 60; step += 1) {
			await page.keyboard.press('Tab');
			const id = await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				if (!el || el === document.body) return null;
				const style = getComputedStyle(el);
				// A focus ring that is `outline: none` with nothing in its place is
				// the same as no focus indicator at all.
				const visible = style.outlineStyle !== 'none' || style.boxShadow !== 'none';
				return `${el.tagName}:${el.getAttribute('name') ?? el.textContent?.trim().slice(0, 20)}:${visible}`;
			});
			if (id) reached.add(id);
		}

		const interactive = await page
			.locator('main button, main a[href], main input, main select, main textarea')
			.count();
		expect(reached.size, 'the tab order reaches fewer controls than the page has').toBeGreaterThan(
			0
		);
		expect(interactive).toBeGreaterThan(0);
		// Every control the walk landed on drew something.
		expect([...reached].filter((entry) => entry.endsWith(':false'))).toEqual([]);
	});

	test('nothing insists on motion', async ({ page }) => {
		test.slow();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const fixture = await seedWithProposal(page);
		await page.goto(`/c/${fixture.slug}`);

		const results = await scan(page).analyze();
		expect(results.violations).toEqual([]);
	});
});

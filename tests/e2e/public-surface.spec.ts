import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * The crawl. `docs/04-security.md` §4, UI spec §1.4.
 *
 * Two properties, both irreversible if broken. **No member-visible text reaches
 * an anonymous reader** — once it is served it is in a cache, an archive and
 * somebody's screenshot, and unpublishing reaches none of those. And **no
 * compliance percentage leaves the building**: UI spec §1.4 is blunt that if
 * "73% compliant" reaches community websites the word stops meaning anything.
 *
 * The percentage assertion is deliberately not "no `%` on the page". A
 * community's own adopted rule may legitimately read *"a change requires 80% of
 * members"*, and a test that fires on that is a test somebody deletes the first
 * time it goes off. It looks for a figure next to a compliance word, and the
 * structural guard — an outward claim with no field a percentage could be
 * computed from — is the real defence, asserted in
 * `tests/integration/publishing.test.ts`.
 */
test.describe('what the world can read', () => {
	test('a community with no public pages has no public surface at all', async ({ browser }) => {
		test.slow();
		const setup = await browser.newContext();
		const page = await setup.newPage();
		const { slug } = await seed(page);
		await setup.close();

		const anonymous = await browser.newContext();
		const visitor = await anonymous.newPage();

		// Not an empty page: nothing. A community that has not opted in is
		// indistinguishable from one that does not exist.
		expect((await visitor.goto(`/p/${slug}`))?.status()).toBe(404);
		expect((await visitor.goto(`/p/${slug}/a/purpose-charter`))?.status()).toBe(404);
		expect((await visitor.goto(`/p/${slug}/sitemap.xml`))?.status()).toBe(404);

		await anonymous.close();
	});

	test('serves robots.txt that allows the public group and nothing else', async ({ browser }) => {
		const anonymous = await browser.newContext();
		const visitor = await anonymous.newPage();

		const response = await visitor.goto('/robots.txt');
		expect(response?.status()).toBe(200);
		const body = await response!.text();

		expect(body).toContain('Allow: /p/');
		for (const surface of ['/c/', '/admin/', '/account/', '/api/']) {
			expect(body, `${surface} should not be advertised to crawlers`).toContain(
				`Disallow: ${surface}`
			);
		}
		await anonymous.close();
	});

	test('shows the claim and the gap list, and never a compliance percentage', async ({
		browser
	}) => {
		test.slow();
		const owner = await browser.newContext();
		const page = await owner.newPage();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/settings/publishing`);
		await page.getByRole('checkbox', { name: /public pages/i }).check();
		await page.getByRole('button', { name: 'Save' }).click();

		const anonymous = await browser.newContext();
		const visitor = await anonymous.newPage();
		const response = await visitor.goto(`/p/${fixture.slug}`);
		expect(response?.status()).toBe(200);

		// The binary claim, and what is missing, named.
		await expect(visitor.getByRole('heading', { name: /not yet compliant/i })).toBeVisible();
		await expect(visitor.getByText(/still to complete/i)).toBeVisible();
		// The self-audit line RCOS Appendix C.5 asks for, honest about never.
		await expect(visitor.getByText(/never run/i)).toBeVisible();

		const body = await visitor.locator('body').innerText();
		expect(body, 'a compliance percentage reached the public surface').not.toMatch(
			/\d+\s*%\s*(compliant|complete|ready|readiness)/i
		);
		expect(body).not.toMatch(/(readiness|compliant)[^.]{0,20}\d+\s*%/i);

		// And nothing the community has not published.
		expect(body).not.toContain('Can someone leave at any time?');

		await owner.close();
		await anonymous.close();
	});
});

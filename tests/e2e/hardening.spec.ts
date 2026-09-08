import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * P7's exit criteria, written before any of it exists and marked `fixme` until
 * it passes — the way `loop.spec.ts` and `publish-export.spec.ts` were.
 *
 * Five properties, one per thing this phase is for. They are deliberately in one
 * spec rather than spread across five, because the question this file answers is
 * "is the phase finished", and an answer assembled from five places is one
 * nobody looks up.
 *
 * The legal, durability and accessibility criteria are asserted in their own
 * suites as well — a restore drill belongs in the integration suite where it can
 * use a scratch directory, and contrast belongs beside the tokens. What is here
 * is the part a person does through the product.
 */
test.describe('the phase is finished when', () => {
	test('a person can be erased, and the register does not change', async ({ page }) => {
		test.fixme(true, 'needs the member list, which group 9 adds');

		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		// A decision they attended, so the register has something to lose.
		await visit(page, `/c/${fixture.slug}/decisions`);
		const registerBefore = await page.locator('main').innerText();

		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, '/account');
		await page.getByRole('button', { name: /erase my account/i }).click();
		await page.getByLabel(/type erase/i).fill('erase');
		await page.getByRole('button', { name: /erase/i }).last().click();

		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/decisions`);
		expect(await page.locator('main').innerText()).toBe(registerBefore);

		await visit(page, `/c/${fixture.slug}/members`);
		await expect(page.getByText(/former member \(M-\d{4}\)/i)).toBeVisible();
		await expect(page.getByText(fixture.member.email)).toHaveCount(0);
	});

	test('a community can read what happens to its data before agreeing to anything', async ({
		page
	}) => {
		const response = await page.goto('/privacy');
		expect(response?.status()).toBe(200);

		const body = await page.locator('main').innerText();
		// The erasure position, in the policy, in the words the code implements.
		expect(body).toMatch(/former member/i);
		expect(body).toMatch(/append-only|register/i);
		// And the honest limit: a bundle already downloaded cannot be recalled.
		expect(body).toMatch(/exported a bundle|already exported/i);

		expect((await page.goto('/terms'))?.status()).toBe(200);
		expect((await page.goto('/sub-processors'))?.status()).toBe(200);
	});

	test('an operator can see that something is broken', async ({ page }) => {
		test.fixme(true, 'needs the error store, which group 7 adds');

		// `/__test/boom` throws on purpose; the error must reach the status page
		// rather than only a log file nobody is watching.
		await page.goto('/__test/boom').catch(() => undefined);

		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, '/admin/status');

		await expect(page.getByRole('heading', { name: /errors/i })).toBeVisible();
		await expect(page.getByText(/__test\/boom/)).toBeVisible();
	});

	test('a member can report something, and it leaves as proposal material', async ({ page }) => {
		test.fixme(true, 'needs the feedback capture, which group 10 adds');

		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/path`);
		await page.getByRole('button', { name: /report a problem/i }).click();
		await page.getByLabel(/what happened/i).fill('The order made no sense to me.');
		await page.getByRole('button', { name: /send/i }).click();

		await visit(page, '/admin/feedback');
		await expect(page.getByText('The order made no sense to me.')).toBeVisible();
	});
});

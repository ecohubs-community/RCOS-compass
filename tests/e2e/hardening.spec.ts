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
	test('a person can be erased, and the register does not change', async ({ browser }) => {
		test.slow();
		// Two contexts, because two people are involved and `/sign-in` redirects
		// somebody who already has a session.
		const stewardContext = await browser.newContext();
		const steward = await stewardContext.newPage();
		const fixture = await seed(steward);
		await signIn(steward, fixture.email, fixture.password);

		// What a steward reads, before anybody is erased.
		await visit(steward, `/c/${fixture.slug}/decisions`);
		const registerBefore = await steward.locator('main').innerText();

		/**
		 * A member erases themselves, from the Account panel of the settings.
		 *
		 * The screen states what survives before it offers the button — including
		 * the `Former member (M-####)` they will read as — because that is the
		 * sentence a community argues about, and it is better argued about here
		 * than discovered afterwards.
		 */
		const memberContext = await browser.newContext();
		const member = await memberContext.newPage();
		await signIn(member, fixture.member.email, fixture.member.password);
		await visit(member, `/c/${fixture.slug}/settings/account`);
		await expect(member.getByText(/former member \(M-\d{4}\)/i)).toBeVisible();
		await member.getByLabel(/type erase/i).fill('erase');
		await member.getByRole('button', { name: /erase my account/i }).click();

		// Nothing left that could sign in as them.
		const after = await browser.newContext();
		const returning = await after.newPage();
		await visit(returning, '/sign-in');
		await returning.getByLabel('Email').fill(fixture.member.email);
		await returning.getByLabel('Password').fill(fixture.member.password);
		await returning.getByRole('button', { name: 'Sign in' }).click();
		await expect(returning).toHaveURL(/sign-in/);

		// And the register the steward reads is exactly what it was. Not "the
		// decision is still there" — the whole page, character for character.
		await visit(steward, `/c/${fixture.slug}/decisions`);
		expect(await steward.locator('main').innerText()).toBe(registerBefore);

		await stewardContext.close();
		await memberContext.close();
		await after.close();
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

	/**
	 * The half of "an operator can see that something is broken" that a person
	 * can reach.
	 *
	 * Recording an error must not change what the visitor gets: the generic page,
	 * the request id, and no internals. The store itself, its scrubbing and its
	 * grouping are asserted in `tests/integration/observability.test.ts`, where
	 * they can be read without inventing an admin session with a second factor in
	 * a browser test.
	 */
	test('an error still answers the visitor honestly, and is recorded behind them', async ({
		page
	}) => {
		const response = await page.goto('/__test/boom');
		expect(response?.status()).toBe(500);

		const body = await page.locator('body').innerText();
		expect(body).toMatch(/went wrong/i);
		// The id the operator's error record carries, so a person's screenshot and
		// the page an operator reads can be matched up.
		expect(body).toMatch(/[0-9a-f-]{8,}/i);
		expect(body).not.toMatch(/at \w+ \(|\.ts:\d+|SqliteError/);
	});

	test('a member can report something from the screen they are on', async ({ page }) => {
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);

		// From wherever they got stuck, not from a feedback page they had to find.
		await visit(page, `/c/${fixture.slug}/path`);
		await page.getByRole('button', { name: /report a problem/i }).click();
		await page.getByLabel(/what happened/i).fill('The order made no sense to me.');
		await page.getByRole('button', { name: /^send$/i }).click();

		await visit(page, `/c/${fixture.slug}/feedback`);
		await expect(page.getByText('The order made no sense to me.')).toBeVisible();
		// The screen it was about, so it is a report rather than a remark.
		await expect(page.getByText(`/c/${fixture.slug}/path`)).toBeVisible();
	});
});

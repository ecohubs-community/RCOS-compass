import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { seed, signIn, visit, type Fixture } from './support.js';

/**
 * A community's join link, end to end. `openspec/changes/pilot-blockers`, the
 * `join-link` spec.
 *
 * The verification mail cannot be read in e2e (no transport), so the spec asks
 * `/__test/verification-link` for the link the mail would have carried and
 * follows it through the library's real endpoint — the hook that tells the
 * stewards runs exactly as it would.
 */
/** The same rules `a11y.spec.ts` holds every page to. */
const scan = (page: Page) =>
	new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

async function stewardWithLink(page: Page): Promise<{ fixture: Fixture; link: string }> {
	const fixture = await seed(page);
	await signIn(page, fixture.email, fixture.password);
	await visit(page, `/c/${fixture.slug}/members`);
	await page.getByRole('button', { name: 'Create a join link' }).click();
	const field = page.getByLabel('Join link');
	await expect(field).toHaveValue(/\/join\//);
	return { fixture, link: await field.inputValue() };
}

/** A stranger follows the link, asks, and confirms their address. */
async function askAndConfirm(
	browser: Browser,
	link: string,
	email: string,
	name: string,
	options: { choosePassword?: boolean } = {}
) {
	const context = await browser.newContext();
	const visitor = await context.newPage();
	await visit(visitor, new URL(link).pathname);
	await expect(visitor.getByRole('heading', { name: /^Ask to join/ })).toBeVisible();
	expect((await scan(visitor)).violations, 'the join form').toEqual([]);

	await visitor.getByLabel('Your name').fill(name);
	await visitor.getByLabel('Your email address').fill(email);
	// No password here: whoever types an address may not own it.
	await expect(visitor.getByLabel('Choose a password')).toHaveCount(0);
	await visitor.getByRole('button', { name: 'Ask to join' }).click();
	await expect(visitor.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

	const minted = await visitor.request.post('/__test/verification-link', {
		data: { email, callbackURL: '/join' }
	});
	expect(minted.ok()).toBe(true);
	await visitor.goto((await minted.json()).url);
	await expect(visitor).toHaveURL(/\/join$/);
	// The owner of the address, signed in by its mail, chooses the password.
	await expect(visitor.getByRole('heading', { name: 'Choose a password' })).toBeVisible();
	expect((await scan(visitor)).violations, 'the password step').toEqual([]);
	if (options.choosePassword === false) return { context, visitor };
	await visitor.getByLabel('Choose a password').fill('a-long-enough-password');
	await visitor.getByRole('button', { name: 'Save password' }).click();
	await expect(visitor.getByRole('heading', { name: 'Waiting for a steward' })).toBeVisible();
	expect((await scan(visitor)).violations, 'the waiting page').toEqual([]);
	return { context, visitor };
}

test.describe('the join link', () => {
	test('a stranger asks, confirms, is let in, and opens the community', async ({
		page,
		browser
	}) => {
		test.slow();
		const { fixture, link } = await stewardWithLink(page);
		const email = `marco-${fixture.slug}@valle-verde.test`;
		const { context, visitor } = await askAndConfirm(browser, link, email, 'Marco Bianchi');

		// Nothing of the community before a steward decides.
		await visitor.goto(`/c/${fixture.slug}`);
		await expect(visitor.getByRole('heading', { name: 'Your next 5' })).toHaveCount(0);

		// The steward sees them — only once the address was proven — and lets them in.
		await visit(page, `/c/${fixture.slug}/members`);
		const asking = page.getByRole('region', { name: 'Asking to join' });
		await expect(asking).toContainText('Marco Bianchi');
		await expect(asking).toContainText(email);
		expect((await scan(page)).violations, 'the members page with a request').toEqual([]);
		await asking.getByRole('button', { name: 'Let Marco Bianchi in' }).click();
		await expect(page.getByText('Marco Bianchi is a member now')).toBeVisible();

		await visit(visitor, `/c/${fixture.slug}`);
		await expect(visitor.getByRole('heading', { name: 'Your next 5' })).toBeVisible();
		await context.close();
	});

	test('someone let in before choosing a password chooses it before anything else', async ({
		page,
		browser
	}) => {
		test.slow();
		const { fixture, link } = await stewardWithLink(page);
		const email = `tomas-${fixture.slug}@valle-verde.test`;
		const { context, visitor } = await askAndConfirm(browser, link, email, 'Tomás Herrera', {
			choosePassword: false
		});

		await visit(page, `/c/${fixture.slug}/members`);
		await page.getByRole('button', { name: 'Let Tomás Herrera in' }).click();
		await expect(page.getByText('Tomás Herrera is a member now')).toBeVisible();

		// The session from the verification mail would outlive the only way back in.
		await visitor.goto(`/c/${fixture.slug}`);
		await expect(visitor).toHaveURL(/\/join$/);
		await visitor.getByLabel('Choose a password').fill('a-long-enough-password');
		await visitor.getByRole('button', { name: 'Save password' }).click();
		await expect(visitor).toHaveURL(new RegExp(`/c/${fixture.slug}$`));
		await context.close();
	});

	test('a declined request leaves nothing behind', async ({ page, browser }) => {
		test.slow();
		const { fixture, link } = await stewardWithLink(page);
		const email = `sofia-${fixture.slug}@valle-verde.test`;
		const { context } = await askAndConfirm(browser, link, email, 'Sofía Ruiz');

		await visit(page, `/c/${fixture.slug}/members`);
		const asking = page.getByRole('region', { name: 'Asking to join' });
		await asking.getByRole('button', { name: 'Decline Sofía Ruiz' }).click();
		await expect(page.getByText('Declined. They have been told.')).toBeVisible();
		await expect(page.getByRole('region', { name: 'Asking to join' })).toHaveCount(0);
		await context.close();
	});

	test('a replaced link stops working at once, and says so', async ({ page, browser }) => {
		test.slow();
		const { link: old } = await stewardWithLink(page);
		await page.getByRole('button', { name: 'Replace link' }).click();
		await expect(page.getByText('Replaced. The old link no longer works.')).toBeVisible();
		await expect(page.getByLabel('Join link')).not.toHaveValue(old);

		const context = await browser.newContext();
		const visitor = await context.newPage();
		await visit(visitor, new URL(old).pathname);
		await expect(
			visitor.getByRole('heading', { name: 'This link does not work any more' })
		).toBeVisible();
		await expect(visitor.getByRole('button', { name: 'Ask to join' })).toHaveCount(0);
		expect((await scan(visitor)).violations, 'a dead link').toEqual([]);
		await context.close();
	});

	test('a member is offered no link and no requests', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, `/c/${fixture.slug}/members`);
		await expect(page.getByRole('heading', { name: 'Share a join link' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Create a join link' })).toHaveCount(0);
	});
});

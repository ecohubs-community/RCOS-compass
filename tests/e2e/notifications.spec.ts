import { expect, test, type Browser, type Page } from '@playwright/test';
import { freezeOnOpenThread, seed, seedWithProposal, signIn, visit } from './support.js';

/**
 * A member's notifications. UI spec §4.11; `openspec/changes/notifications-page`.
 */

/** The owner records a decision, which tells the member. Returns the member's page. */
async function memberToldOfADecision(page: Page, browser: Browser) {
	const fixture = await seedWithProposal(page);
	await freezeOnOpenThread(page);
	await expect(page).toHaveURL(/\/d\/DEC-/);

	const context = await browser.newContext();
	const member = await context.newPage();
	await signIn(member, fixture.member.email, fixture.member.password);
	return { member, context, slug: fixture.slug };
}

const decisionItem = (page: Page) => page.getByRole('button', { name: /recorded:/ });

test.describe('notifications', () => {
	test('loading the page marks nothing, and opening one goes to it and reads it', async ({
		page,
		browser
	}) => {
		test.slow();
		const { member, context, slug } = await memberToldOfADecision(page, browser);

		// Loaded twice, and fetched the way a preloading browser would: still unread.
		await visit(member, `/c/${slug}/notifications`);
		await member.request.get(`/c/${slug}/notifications`);
		await visit(member, `/c/${slug}/notifications`);
		await expect(decisionItem(member)).toHaveAccessibleName(/^Unread: /);

		await decisionItem(member).click();
		await expect(member).toHaveURL(/\/d\/DEC-/);

		await visit(member, `/c/${slug}/notifications`);
		await expect(decisionItem(member)).not.toHaveAccessibleName(/^Unread: /);
		await expect(member.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
		await context.close();
	});

	test('Mark all as read reads every one', async ({ page, browser }) => {
		test.slow();
		const { member, context, slug } = await memberToldOfADecision(page, browser);

		await visit(member, `/c/${slug}/notifications`);
		await member.getByRole('button', { name: 'Mark all as read' }).click();
		await expect(member.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
		await expect(decisionItem(member)).not.toHaveAccessibleName(/^Unread: /);
		await context.close();
	});

	test('a notification about something removed says it is no longer available', async ({
		page
	}) => {
		const { slug, member } = await seed(page, { removedDocumentNotice: true });
		await signIn(page, member.email, member.password);
		await visit(page, `/c/${slug}/notifications`);

		const item = page.getByRole('button', { name: /No longer available/ });
		// Nothing of what it was about: not even the filename.
		await expect(item).not.toContainText('bylaws.pdf');
		await item.click();
		await expect(page).toHaveURL(/\/notifications\?gone=/);
		await expect(
			page.getByText('What that notification was about is no longer available to you.')
		).toBeVisible();
	});

	test('opens without JavaScript @no-js', async ({ page, browser }) => {
		test.slow();
		const { slug, member } = await seed(page, { removedDocumentNotice: true });
		const scripted = await browser.newContext({ javaScriptEnabled: true });
		const helper = await scripted.newPage();
		await signIn(helper, member.email, member.password);
		await page.context().addCookies((await scripted.storageState()).cookies);
		await scripted.close();

		await page.goto(`/c/${slug}/notifications`);
		await page.getByRole('button', { name: /No longer available/ }).click();
		await expect(page).toHaveURL(/\/notifications\?gone=/);
		await expect(page.getByRole('button', { name: /^Unread: / })).toHaveCount(0);
	});
});

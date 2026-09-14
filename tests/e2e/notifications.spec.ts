import AxeBuilder from '@axe-core/playwright';
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

test.describe('the bell', () => {
	const bell = (page: Page, name: string | RegExp) => page.getByRole('button', { name });

	test('shows the count, opens the latest, and an item reaches what it is about', async ({
		page,
		browser
	}) => {
		test.slow();
		const { member, context, slug } = await memberToldOfADecision(page, browser);
		// Whoever froze it is not told about their own act.
		await visit(page, `/c/${slug}`);
		await expect(bell(page, 'Notifications, none unread')).toBeVisible();

		await visit(member, `/c/${slug}`);
		const popover = member.getByRole('dialog', { name: 'Notifications' });
		await bell(member, 'Notifications, 1 unread').click();
		await expect(popover).toBeVisible();

		await popover.getByRole('button', { name: /recorded:/ }).click();
		await expect(member).toHaveURL(/\/d\/DEC-/);
		await expect(bell(member, 'Notifications, none unread')).toBeVisible();

		await bell(member, 'Notifications, none unread').click();
		await popover.getByRole('link', { name: 'See all' }).click();
		await expect(member).toHaveURL(new RegExp(`/c/${slug}/notifications$`));
		await expect(popover).toBeHidden();
		await context.close();
	});

	test('updates after a form action on the same page', async ({ page, browser }) => {
		test.slow();
		const { member, context, slug } = await memberToldOfADecision(page, browser);

		await visit(member, `/c/${slug}/notifications`);
		await expect(bell(member, 'Notifications, 1 unread')).toBeVisible();
		await member.getByRole('button', { name: 'Mark all as read' }).click();
		await expect(bell(member, 'Notifications, none unread')).toBeVisible();
		await context.close();
	});

	test('has no violations with the popover open, on a phone and on a desktop', async ({
		page,
		browser
	}) => {
		test.slow();
		const { member, context, slug } = await memberToldOfADecision(page, browser);

		for (const size of [
			{ width: 375, height: 812 },
			{ width: 1440, height: 900 }
		]) {
			await member.setViewportSize(size);
			await visit(member, `/c/${slug}`);
			await bell(member, 'Notifications, 1 unread').click();
			await expect(member.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
			const results = await new AxeBuilder({ page: member })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			expect(results.violations, `at ${size.width}px`).toEqual([]);
		}
		await context.close();
	});

	test('is a link to the page without JavaScript @no-js', async ({ page, browser }) => {
		const { slug, member } = await seed(page, { removedDocumentNotice: true });
		const scripted = await browser.newContext({ javaScriptEnabled: true });
		const helper = await scripted.newPage();
		await signIn(helper, member.email, member.password);
		await page.context().addCookies((await scripted.storageState()).cookies);
		await scripted.close();

		await page.goto(`/c/${slug}`);
		await page.getByRole('link', { name: 'Notifications, 1 unread' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${slug}/notifications$`));
	});
});

test.describe('mentions', () => {
	test('@ offers members by name, inserts their number, and tells them', async ({
		page,
		browser
	}) => {
		test.slow();
		const fixture = await seedWithProposal(page);
		const thread = page.url().split('?')[0]!;
		await visit(page, thread);

		const reply = page.getByRole('textbox', { name: 'Reply to the thread' });
		await reply.fill('');
		await reply.pressSequentially('Over to you @Len');
		const option = page.getByRole('option', { name: /Lena Vogt/ });
		await expect(option).toBeVisible();
		await reply.press('Enter');
		await expect(reply).toHaveValue(/^Over to you @M-\d{4} $/);
		await page.getByRole('button', { name: 'Send' }).click();

		// The post keeps the number and shows the name.
		await expect(page.locator('[data-mention]').filter({ hasText: '@Lena Vogt' })).toBeVisible();

		const context = await browser.newContext();
		const member = await context.newPage();
		await signIn(member, fixture.member.email, fixture.member.password);
		await visit(member, `/c/${fixture.slug}`);
		await member.getByRole('button', { name: 'Notifications, 1 unread' }).click();
		await expect(
			member.getByRole('dialog', { name: 'Notifications' }).getByRole('button', {
				name: /Ana Restrepo mentioned you in/
			})
		).toBeVisible();
		await context.close();
	});
});

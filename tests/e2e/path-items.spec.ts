import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * `openspec/changes/path-items-cite-their-clauses`.
 *
 * A Path item says which RCOS text it answers, every item can be started, and a
 * thread opens that text in a sheet rather than sending its reader away.
 *
 * The refs are the standard's own (Voluntary Exit owns §3.6.1, §3.6.2, §3.6.4;
 * Non-Goals owns nothing and relies on §2.1.5), written down because the point
 * of the test is that those particular numbers reach the screen.
 */

const NON_GOALS = /What are we deliberately not/;
const VOLUNTARY = /How can someone leave whenever they choose/;

const pathItem = (page: Page, question: RegExp) =>
	page
		.getByRole('list', { name: 'What to decide next' })
		.getByRole('listitem')
		.filter({ hasText: question });

test.describe('a Path item', () => {
	test('whose section owns no clause can be started, and then offers its discussion', async ({
		page
	}) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/path?all=1`);
		const item = pathItem(page, NON_GOALS);
		// The clause it relies on, said to be related rather than answered.
		await expect(item).toContainText('related');
		await expect(item.getByRole('link', { name: '§2.1.5' })).toHaveAttribute(
			'href',
			`/c/${slug}/standard#clause-2.1.5`
		);

		await item.getByRole('link', { name: 'Start discussion' }).click();
		await expect(page.getByLabel('Start a discussion')).toHaveValue(NON_GOALS);
		await page.getByRole('button', { name: 'Start', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${slug}/discussions/[^/?]+`));
		await expect(page.getByRole('link', { name: '§2.1.5' })).toBeVisible();

		await visit(page, `/c/${slug}/path?all=1`);
		await expect(
			pathItem(page, NON_GOALS).getByRole('link', { name: 'Open discussion' })
		).toBeVisible();
	});

	test('cites every clause its section owns, each linking into the standard', async ({ page }) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/path?all=1`);
		const item = pathItem(page, VOLUNTARY);
		for (const ref of ['3.6.1', '3.6.2', '3.6.4']) {
			await expect(item.getByRole('link', { name: `§${ref}` })).toBeVisible();
		}
		await item.getByRole('link', { name: '§3.6.2' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${slug}/standard#clause-3\\.6\\.2$`));
	});
});

test.describe('a discussion', () => {
	async function openVoluntaryExit(page: Page) {
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path?all=1`);
		await pathItem(page, VOLUNTARY).getByRole('link', { name: 'Start discussion' }).click();
		await expect(page.getByLabel('Start a discussion')).toHaveValue(VOLUNTARY);
		await page.getByRole('button', { name: 'Start', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/discussions/[^/?]+`));
		await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
		return fixture;
	}

	test('opens the RCOS text in a sheet, marked at the clause chosen', async ({ page }) => {
		await openVoluntaryExit(page);

		const ref = page.getByRole('link', { name: '§3.6.2' });
		await ref.click();
		const sheet = page.getByRole('dialog', { name: 'The RCOS requirement' });
		await expect(sheet).toBeVisible();
		for (const clause of ['3.6.1', '3.6.2', '3.6.4']) {
			await expect(sheet.getByText(`§${clause}`, { exact: true })).toBeVisible();
		}
		await expect(sheet.locator('blockquote[aria-current="true"]')).toContainText(
			'Exit procedures MUST be explicit, documented, and non-punitive.'
		);

		await sheet.getByText('What NOT to define here').click();
		await expect(sheet.getByText('Forced Exit', { exact: true })).toBeVisible();
		await expect(sheet.getByText('Asset, Role, and Responsibility Separation')).toBeVisible();

		const scan = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(scan.violations).toEqual([]);

		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		await expect(ref).toBeFocused();
	});

	test('opens as a bottom sheet on a phone, with a close control that fits a thumb', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile-small', 'the 375px project');
		await openVoluntaryExit(page);

		await page.getByRole('link', { name: '§3.6.1' }).click();
		const sheet = page.getByRole('dialog', { name: 'The RCOS requirement' });
		await expect(sheet).toBeVisible();
		const box = (await sheet.boundingBox())!;
		const viewport = page.viewportSize()!;
		expect(Math.round(box.width)).toBe(viewport.width);
		expect(Math.round(box.y + box.height)).toBe(viewport.height);

		const close = sheet.getByRole('button', { name: 'Close' });
		const target = (await close.boundingBox())!;
		expect(target.width).toBeGreaterThanOrEqual(44);
		expect(target.height).toBeGreaterThanOrEqual(44);
		await close.click();
		await expect(sheet).toBeHidden();
	});

	test('about nothing in the standard shows no references', async ({ page }) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/discussions`);
		await page.getByLabel('Start a discussion').fill('The dinner rota');
		await page.getByRole('button', { name: 'Start', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'The dinner rota' })).toBeVisible();
		await expect(page.getByRole('link', { name: /^§/ })).toHaveCount(0);
	});

	test('links each reference to the standard browser without JavaScript @no-js', async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		const fixture = await seed(page);
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill(fixture.email);
		await page.getByLabel('Password').fill(fixture.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await page.goto(`/c/${fixture.slug}/path?all=1`);
		await pathItem(page, VOLUNTARY).getByRole('link', { name: 'Start discussion' }).click();
		await page.getByRole('button', { name: 'Start', exact: true }).click();

		await page.getByRole('link', { name: '§3.6.2' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}/standard#clause-3\\.6\\.2$`));
		await context.close();
	});
});

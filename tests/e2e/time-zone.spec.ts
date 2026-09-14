import { expect, test, type Browser } from '@playwright/test';
import { freezeOnOpenThread, seed, seedWithProposal, signIn, visit } from './support.js';

/**
 * Times in the reader's own zone. `openspec/changes/local-time`, the
 * `time-display` spec.
 */

async function browserIn(browser: Browser, timezoneId: string) {
	const context = await browser.newContext({ timezoneId });
	return { context, page: await context.newPage() };
}

test.describe('a person’s time zone', () => {
	test('is detected once from the browser, and not changed by travelling', async ({
		page,
		browser
	}) => {
		test.slow();
		const { email, password, slug } = await seed(page);

		const lisbon = await browserIn(browser, 'Europe/Lisbon');
		await signIn(lisbon.page, email, password);
		await visit(lisbon.page, `/c/${slug}`);
		await expect(async () => {
			await visit(lisbon.page, '/account');
			await expect(lisbon.page.getByLabel('Your time zone')).toHaveValue('Europe/Lisbon', {
				timeout: 2_000
			});
		}).toPass({ timeout: 20_000 });
		await lisbon.context.close();

		const tokyo = await browserIn(browser, 'Asia/Tokyo');
		await signIn(tokyo.page, email, password);
		await visit(tokyo.page, `/c/${slug}`);
		await visit(tokyo.page, '/account');
		await expect(tokyo.page.getByLabel('Your time zone')).toHaveValue('Europe/Lisbon');
		await tokyo.page
			.getByRole('button', { name: 'Use this device’s time zone (Asia/Tokyo)' })
			.or(tokyo.page.getByRole('button', { name: "Use this device's time zone (Asia/Tokyo)" }))
			.click();
		await expect(tokyo.page.getByRole('status')).toHaveText('Saved.');
		await expect(tokyo.page.getByLabel('Your time zone')).toHaveValue('Asia/Tokyo');
		await tokyo.context.close();
	});

	test('shows the same times before and after the page hydrates', async ({ browser }) => {
		test.slow();
		// The browser in Tokyo, the server in whatever zone the machine runs.
		const tokyo = await browserIn(browser, 'Asia/Tokyo');
		await seedWithProposal(tokyo.page);
		const thread = tokyo.page.url();
		// Let detection settle, so the server renders in the person's zone too.
		await visit(tokyo.page, '/account');
		await expect(tokyo.page.getByLabel('Your time zone')).toHaveValue('Asia/Tokyo', {
			timeout: 20_000
		});

		// A decision too, so the register and the dashboard have dates on them.
		await visit(tokyo.page, thread);
		await freezeOnOpenThread(tokyo.page);
		await expect(tokyo.page).toHaveURL(/\/d\/DEC-/);
		const decision = tokyo.page.url();
		const slug = new URL(thread).pathname.split('/')[2];

		const TIME = /\b\d{1,2} [A-Z][a-z]{2,4}(?:, \d{2}:\d{2}| \d{4})?\b/g;
		for (const url of [thread, decision, `/c/${slug}`]) {
			const served = await (await tokyo.page.request.get(url)).text();
			const serverTimes = [...served.replace(/<[^>]+>/g, ' ').matchAll(TIME)].map((m) => m[0]);
			expect(serverTimes.length, `${url} shows at least one time`).toBeGreaterThan(0);

			await visit(tokyo.page, url);
			const hydratedTimes = [...(await tokyo.page.locator('body').innerText()).matchAll(TIME)].map(
				(m) => m[0]
			);
			expect(hydratedTimes.length, url).toBeGreaterThan(0);
			for (const time of hydratedTimes) expect(serverTimes, url).toContain(time);
		}
		await tokyo.context.close();
	});

	test('can be chosen without JavaScript @no-js', async ({ page, browser }) => {
		test.slow();
		const { email, password } = await seed(page);
		const scripted = await browser.newContext({ javaScriptEnabled: true, timezoneId: 'UTC' });
		const helper = await scripted.newPage();
		await signIn(helper, email, password);
		await page.context().addCookies((await scripted.storageState()).cookies);
		await scripted.close();

		await page.goto('/account');
		await page.getByLabel('Your time zone').selectOption('America/New_York');
		await page.getByRole('button', { name: 'Save time zone' }).click();
		await expect(page.getByLabel('Your time zone')).toHaveValue('America/New_York');
	});
});

import { expect, type Page } from '@playwright/test';

/**
 * The pieces both e2e specs need. They lived in each spec first and drifted
 * within a day — one waited for the session after signing in and the other did
 * not — so they live here instead.
 */

export type Fixture = {
	slug: string;
	email: string;
	password: string;
	communityId: string;
	member: { email: string; password: string };
	clauseKey: string;
	clauseRef: string;
};

/** A fresh community, built through the application's own paths. */
export async function seed(page: Page): Promise<Fixture> {
	const response = await page.request.post('/__test/seed', { data: {} });
	expect(response.ok(), 'the seed route is gated on ALLOW_TEST_ROUTES').toBe(true);
	return (await response.json()) as Fixture;
}

/**
 * Go to a page and wait until it has hydrated.
 *
 * Every form works server-side, so the page is usable before its JavaScript
 * arrives — and hydration then replaces the DOM under anything already typed.
 * A person is too slow to collide with that. A test is not: it showed up as a
 * sign-in posted with an empty email, failing five seconds later as a redirect
 * that never came. `src/routes/+layout.svelte` sets the attribute this waits on.
 */
export async function visit(page: Page, url: string) {
	await page.goto(url);
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached', timeout: 15_000 });
}

export async function signIn(page: Page, email: string, password: string) {
	await visit(page, '/sign-in');

	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	// The session before anything else: a request made mid-sign-in is an
	// anonymous one, and an anonymous request for a community is a 404.
	await expect(page).toHaveURL(/\/(c\/|$)/, { timeout: 15_000 });
}

/** Signed in, with a discussion carrying a proposal — enough for every screen. */
export async function seedWithProposal(page: Page): Promise<Fixture> {
	const fixture = await seed(page);
	await signIn(page, fixture.email, fixture.password);

	await visit(page, `/c/${fixture.slug}/discussions`);
	await page.getByLabel('Start a discussion').fill('Can someone leave at any time?');
	await page.getByLabel('Clause (optional)').fill(fixture.clauseKey);
	await page.getByRole('button', { name: 'Start' }).click();
	await page
		.getByLabel('Write a proposal', { exact: false })
		.fill('A member may leave at any time.');
	await page.getByRole('button', { name: 'Post proposal' }).click();

	return fixture;
}

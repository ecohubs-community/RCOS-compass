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
	/** Invited and not accepted, so a spec can drive the acceptance page. */
	invitation: { email: string; token: string };
	clauseKey: string;
	clauseRef: string;
};

/** A fresh community, built through the application's own paths. */
export async function seed(
	page: Page,
	options: { locale?: string; removedDocumentNotice?: boolean } = {}
): Promise<Fixture> {
	const response = await page.request.post('/__test/seed', { data: options });
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
	// Writing the rule is its own act on the composer, not the reply box.
	await page.getByRole('link', { name: 'Write a proposal' }).click();
	await expect(page.getByRole('button', { name: 'Save as v1' })).toBeVisible();
	await page.getByLabel('The text a decision would adopt').fill('A member may leave at any time.');
	await page.getByRole('button', { name: 'Save as v1' }).click();
	await expect(page.getByRole('heading', { name: 'Responses to v1' })).toBeVisible();

	return fixture;
}

/**
 * Write the proposal on the table, through the composer a member uses.
 *
 * Three specs had this block copied out, and all three broke together the day
 * the composer stopped being a second textarea below the thread. One place, so
 * the next change to that screen is one edit rather than a hunt.
 */
export async function proposeOnOpenThread(page: Page, text: string) {
	await page.getByRole('link', { name: 'Write a proposal' }).click();
	await expect(page.getByRole('button', { name: /^Save as v/ })).toBeVisible();
	await page.getByLabel('The text a decision would adopt').fill(text);
	await page.getByRole('button', { name: /^Save as v/ }).click();
	await expect(page.getByRole('heading', { name: /^Responses to v/ })).toBeVisible();
}

/** Freeze the version on the table, with the least the form will accept. */
export async function freezeOnOpenThread(page: Page, mechanism = 'consent') {
	await page.getByRole('button', { name: /^Freeze v\d+$/ }).click();
	const form = page.getByRole('region', { name: /^Freeze v\d+ into a decision$/ });
	await form.getByLabel('Mechanism').fill(mechanism);
	await form.getByRole('button', { name: 'Record decision' }).click();
}

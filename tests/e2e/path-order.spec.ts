import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support';

/**
 * The ordering, as a community actually meets it. UI spec §4.4.
 *
 * The integration suite proves the arithmetic. What it cannot prove is that a
 * community can *reach* the argument: that the reasons are on the screen, that
 * moving something works without a mouse, and that the tool says which of the
 * two positions is theirs.
 */
test.describe('the path a community can argue with', () => {
	test('says why each item is where it is, and offers the interview', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		// A day-one community is told the order is structural rather than left to
		// assume the list was tailored to them.
		await expect(page.getByText('This order is structural')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Answer them' })).toBeVisible();

		const list = page.getByRole('list', { name: 'What to decide next' });
		await expect(list.getByRole('listitem').first()).toContainText(
			'Nothing else has to be decided first'
		);
	});

	test("carries the item's question into the discussion it starts", async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		// The first item with no thread yet: a seeded community already has one
		// open against the top item, and that item's link says "Open".
		const item = page
			.getByRole('list', { name: 'What to decide next' })
			.getByRole('listitem')
			.filter({ has: page.getByRole('link', { name: 'Start discussion', exact: true }) })
			.first();

		// The item's own wording, read off the screen rather than assumed: the
		// point of the test is that whatever the Path says is what the discussion
		// is called.
		const question = (await item.locator('p').first().textContent())!.trim();
		expect(question, 'a path item asks something rather than naming a container').toMatch(/\?$/);

		await item.getByRole('link', { name: 'Start discussion', exact: true }).click();

		// Both halves arrive filled: the clause the item answers, and the question
		// the whole community has been reading in the Path. Typing it again from a
		// blank field is how a thread ends up called "membership stuff".
		await expect(page.getByLabel('Start a discussion')).toHaveValue(question);
		await expect(page.getByLabel('Clause (optional)')).not.toHaveValue('');
	});

	test('moves an item by keyboard alone, and says both positions', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		const items = page.getByRole('list', { name: 'What to decide next' }).getByRole('listitem');
		const second = await items.nth(1).innerText();

		// Dragging is the fast way; this is the way that works on a phone and with
		// a keyboard, and both are supported surfaces.
		const up = page.getByRole('button', { name: /^Move .* up$/ }).nth(1);
		await up.focus();
		await expect(up).toBeFocused();
		await page.keyboard.press('Enter');

		await expect(items.first()).toContainText(second.split('\n')[0]!);
		await expect(items.first()).toContainText('The ordering puts it at 2');

		await page
			.getByRole('button', { name: /Put it back where the ordering had it/ })
			.first()
			.click();
		await expect(page.getByText('The ordering puts it at')).toBeHidden();
	});

	test('keeps a reorder private until a steward publishes it', async ({ page, browser }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		const items = page.getByRole('list', { name: 'What to decide next' }).getByRole('listitem');
		const second = (await items.nth(1).locator('p').first().textContent())!.trim();

		await page.getByRole('button', { name: `Move “${second}” up` }).click();
		await expect(items.first()).toContainText(second);

		// The banner the mockup draws, in the mockup's own words.
		await expect(page.getByText('only you can see this order')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Publish this order' })).toBeVisible();

		// A second member is looking at the community's order, not the steward's.
		const other = await browser.newContext();
		const theirs = await other.newPage();
		await signIn(theirs, fixture.member.email, fixture.member.password);
		await visit(theirs, `/c/${fixture.slug}/path`);
		const theirItems = theirs
			.getByRole('list', { name: 'What to decide next' })
			.getByRole('listitem');
		await expect(theirItems.first()).not.toContainText(second);
		await expect(theirs.getByText('only you can see this order')).toBeHidden();

		await page.getByRole('button', { name: 'Publish this order' }).click();
		await expect(page.getByText('only you can see this order')).toBeHidden();

		// Now it is everybody's.
		await visit(theirs, `/c/${fixture.slug}/path`);
		await expect(theirItems.first()).toContainText(second);
		await expect(theirs.getByText('The community placed this here')).toBeVisible();
		await other.close();
	});

	test("lets a member order their own list, and not the community's", async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, `/c/${fixture.slug}/path`);

		const items = page.getByRole('list', { name: 'What to decide next' }).getByRole('listitem');
		const second = (await items.nth(1).locator('p').first().textContent())!.trim();
		await page.getByRole('button', { name: `Move “${second}” up` }).click();

		await expect(items.first()).toContainText(second);
		await expect(page.getByText('only you can see this order')).toBeVisible();
		// `path.publish` is a steward's; the banner says who does it instead of
		// offering a button that would refuse.
		await expect(page.getByRole('button', { name: 'Publish this order' })).toHaveCount(0);
		await expect(page.getByText('A steward publishes an order for everybody')).toBeVisible();

		await page.getByRole('button', { name: 'Discard changes' }).click();
		await expect(page.getByText('only you can see this order')).toBeHidden();
		await expect(items.first()).not.toContainText(second);
	});

	test('offers the mockups’ three starting points, and says what they keep', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		await expect(page.getByRole('heading', { name: 'What should we tackle first?' })).toBeVisible();
		await page.getByRole('button', { name: 'The riskiest gaps for us' }).click();
		await expect(page.getByText('Order updated')).toBeVisible();

		// A preset is the same setting the settings screen edits, so the numbers
		// are visible there rather than being a second hidden opinion.
		await visit(page, `/c/${fixture.slug}/settings/path`);
		await expect(page.getByLabel('What you told us about yourselves')).toHaveValue('60');
		// And it left the structural order alone, which is the promise on the tin.
		await expect(page.getByLabel('Answer what unblocks other things first')).toHaveValue('250');
	});

	test('shows the weights, says what each is doing, and keeps the ones you did not touch', async ({
		page
	}) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/settings/path`);

		await expect(page.getByText('These are the strengths Compass ships with')).toBeVisible();

		const weights = {
			dependency: page.getByLabel('Answer what unblocks other things first'),
			severity: page.getByLabel('How much of the standard one answer settles'),
			risk: page.getByLabel('What you told us about yourselves'),
			attention: page.getByLabel('What is already going on')
		};

		await weights.dependency.fill('50');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('These are the strengths Compass ships with')).toBeHidden();

		/**
		 * The regression this test exists for.
		 *
		 * A successful `use:enhance` submit calls `form.reset()`, and these inputs
		 * carry their value as a property rather than an attribute — so every box
		 * emptied, Svelte rewrote only the one whose value had changed, and the
		 * next save posted blanks for the rest. `Number('')` is 0, so editing one
		 * number and saving twice silently zeroed the three nobody had touched. It
		 * happened to a steward before it was caught here.
		 */
		await expect(weights.severity).not.toHaveValue('');
		await expect(weights.risk).not.toHaveValue('');
		await expect(weights.attention).not.toHaveValue('');

		await weights.severity.fill('12');
		await page.getByRole('button', { name: 'Save' }).click();

		await visit(page, `/c/${fixture.slug}/settings/path`);
		await expect(weights.dependency).toHaveValue('50');
		await expect(weights.severity).toHaveValue('12');
		await expect(weights.risk).toHaveValue('10');
		await expect(weights.attention).toHaveValue('8');

		await expect(page.getByRole('heading', { name: 'What it was before' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'What that produces' })).toBeVisible();
		// The numbers explain themselves from the community's own list.
		await expect(page.getByText(/% of the order/).first()).toBeVisible();
	});

	test('the interview says what each answer will do, before it is answered', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/path`);

		await page.getByRole('link', { name: 'Answer them' }).click();

		// The consequence is on the page beside the option, not after the answer.
		// An interview that reorders a community's work without saying so feels
		// like it was the community's own choice.
		await expect(page.getByText('Do you hold land or buildings together?')).toBeVisible();
		await expect(page.getByText('Moves up:').first()).toBeVisible();

		await page
			.getByRole('group', { name: 'Do you hold money together?' })
			.getByLabel('Yes', { exact: true })
			.check();
		await page.getByRole('button', { name: 'Save' }).click();

		await expect(page.getByText('Saved.')).toBeVisible();

		// Answering it removes the "this is not tailored to you" notice.
		await visit(page, `/c/${fixture.slug}/path`);
		await expect(page.getByText('This order is structural')).toBeHidden();
		await expect(page.getByText('Ordered for this community')).toBeVisible();
	});

	test('is skippable, and says so', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/settings/interview`);

		// Every question can be left unanswered, and nothing forces the screen.
		await expect(page.getByLabel('Skip this one')).toHaveCount(5);
		await visit(page, `/c/${fixture.slug}/path`);
		await expect(page.getByRole('listitem').first()).toBeVisible();
	});
});

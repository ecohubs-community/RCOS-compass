import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * Joining a community. `openspec/specs/invitations/spec.md`.
 *
 * The spec's first scenario says the invited person "follows a valid invitation
 * and signs in with that address". Every layer of that existed except the
 * following: `acceptInvitation` was written, tested and unreachable, and the
 * link in the mail answered 404. So this spec drives the door rather than the
 * service — the refusals as much as the acceptance, because a person who is
 * refused is the one who most needs the page to say something.
 */
test.describe('an invitation', () => {
	test('a person with no account creates one and lands in the community', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);

		await visit(page, `/invitations/${fixture.invitation.token}?c=${fixture.slug}`);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('invited');
		// The address is the invitation's, and there is no field offering to
		// change it: the binding is not a suggestion.
		await expect(page.locator('main')).toContainText(fixture.invitation.email);
		await expect(page.getByLabel('Email')).toHaveCount(0);

		await page.getByLabel('Your name').fill('Bruno Márquez');
		await page.getByLabel('Choose a password').fill('a-long-enough-password');
		await page.getByRole('button', { name: 'Create account and join' }).click();

		// Signed in and inside, in one step: the invitation was delivered to that
		// mailbox, so nothing asks them to prove the same thing twice.
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}$`), { timeout: 15_000 });
		await visit(page, `/c/${fixture.slug}/members`);
		await expect(page.locator('main')).toContainText('Bruno Márquez');
	});

	test('is refused the second time it is used', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		const url = `/invitations/${fixture.invitation.token}?c=${fixture.slug}`;

		await visit(page, url);
		await page.getByLabel('Your name').fill('Bruno Márquez');
		await page.getByLabel('Choose a password').fill('a-long-enough-password');
		await page.getByRole('button', { name: 'Create account and join' }).click();
		await expect(page).toHaveURL(new RegExp(`/c/${fixture.slug}$`), { timeout: 15_000 });

		await visit(page, url);
		await expect(page.locator('main')).toContainText('already been used');
		await expect(page.getByLabel('Your name')).toHaveCount(0);
	});

	test('will not be taken up by a different address', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/invitations/${fixture.invitation.token}?c=${fixture.slug}`);

		// Signed in as a steward of the very community doing the inviting, which
		// is the case worth checking: membership somewhere is not permission to
		// consume somebody else's invitation.
		await expect(page.locator('main')).toContainText(fixture.invitation.email);
		await expect(page.locator('main')).toContainText(fixture.email);
		await expect(page.getByRole('button', { name: 'Accept and join' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	});

	test('says so plainly when the link is not one', async ({ page }) => {
		const fixture = await seed(page);

		// A 404 would be the wrong answer here. Nothing is being protected — the
		// person holding a mistyped link needs to be told it is a mistyped link,
		// not shown the page that means "no such address on this server".
		await visit(page, `/invitations/not-a-real-token?c=${fixture.slug}`);
		await expect(page.locator('main')).toContainText('does not work');
	});

	test('is read in the community language', async ({ page }) => {
		test.slow();
		const fixture = await seed(page, { locale: 'de' });

		await visit(page, `/invitations/${fixture.invitation.token}?c=${fixture.slug}`);

		// The invited person has no membership and no tenant, so the locale can
		// only come from the community the link names. Without that they would
		// meet the product in English and join a community that works in German.
		await expect(page.locator('main')).toContainText('eingeladen');
		await expect(page.getByLabel('Dein Name')).toBeVisible();
	});
});

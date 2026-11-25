import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';

/**
 * A community reading its own register. `openspec/specs/tenancy/spec.md`.
 *
 * The services existed from P1 and had no screen, which is the whole reason
 * this file exists: `listMembers`, `setMemberRole` and `endMembership` were
 * correct, tested one layer down, and unreachable by anybody the product is
 * for.
 */
test.describe('the member list', () => {
	test('a steward reads it, changes a role, and ends a membership', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);

		await visit(page, `/c/${fixture.slug}/members`);
		const list = page.locator('main');

		// Both people, with the numbers the register refers to and the flag that
		// says who is accountable for transfer and deletion.
		await expect(list).toContainText('Ana Restrepo');
		await expect(list).toContainText('M-0001');
		await expect(list).toContainText('Lena Vogt');
		await expect(list).toContainText('M-0002');
		await expect(list).toContainText('Owner');

		await page.getByLabel('Role for Lena Vogt').selectOption('steward');
		await page.getByRole('button', { name: 'Change role' }).click();
		await expect(page.getByText('Role changed.')).toBeVisible();

		await page.getByRole('button', { name: 'End the membership of Lena Vogt' }).click();

		// Moved rather than dropped: the row is what a decision she consented to
		// still counts, so the screen has to keep saying she was here.
		const former = page.getByRole('region', { name: 'People who have left' });
		await expect(former).toContainText('Lena Vogt');
		await expect(former).toContainText('M-0002');
	});

	test('the owner is not offered controls that would refuse', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/members`);

		// `setMemberRole` and `endMembership` both refuse the owner, so the screen
		// says why instead of offering a control that cannot work.
		await expect(page.getByLabel('Role for Ana Restrepo')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /End the membership of Ana/ })).toHaveCount(0);
		await expect(page.getByText(/Transfer ownership/)).toBeVisible();
	});

	test('a steward is offered no controls on their own row', async ({ page, browser }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/members`);

		// Lena becomes a steward, so there is somebody who holds `member.manage`
		// and does not own the community — the only actor this rule is about.
		await page.getByLabel('Role for Lena Vogt').selectOption('steward');
		await page.getByRole('button', { name: 'Change role' }).click();
		await expect(page.getByText('Role changed.')).toBeVisible();

		const context = await browser.newContext();
		const lena = await context.newPage();
		await signIn(lena, fixture.member.email, fixture.member.password);
		await visit(lena, `/c/${fixture.slug}/members`);

		// Her own row explains instead of offering, and the only other row is the
		// owner's — so a steward alone with herself is offered nothing at all.
		await expect(lena.getByLabel('Role for Lena Vogt')).toHaveCount(0);
		await expect(lena.getByRole('button', { name: /End the membership of Lena/ })).toHaveCount(0);
		await expect(lena.getByText(/Ask another steward/)).toBeVisible();
		await expect(lena.getByRole('button', { name: 'Change role' })).toHaveCount(0);

		await context.close();
	});

	test('a member sees who is here and cannot change any of it', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, `/c/${fixture.slug}/members`);

		// Knowing who you are governing with is not a privilege; deciding it is.
		await expect(page.locator('main')).toContainText('Ana Restrepo');
		await expect(page.getByText(/Only a steward/i)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Change role' })).toHaveCount(0);
	});
});

/**
 * Inviting from the member list. `openspec/changes/pilot-blockers` D1–D2.
 *
 * E2E has no mail server, so every invitation that is created comes back as
 * "not sent" — which is the state a steward must be able to read and act on.
 */
test.describe('inviting people', () => {
	test('a steward pastes a list and reads what became of each address', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}/members`);

		const fresh = `marco-${fixture.slug}@valle-verde.test`;
		await page.getByLabel('Addresses').fill(`${fresh}, ${fixture.member.email}\nnot-an-address`);
		await page.getByRole('button', { name: 'Send invitations' }).click();

		const results = page.getByRole('region', { name: 'What happened' });
		await expect(results).toContainText(`${fresh}`);
		await expect(results).toContainText('Not sent');
		await expect(results).toContainText('Already a member');
		await expect(results).toContainText('Not an email address');
		// The link itself is never put on the page instead of the mail.
		await expect(page.locator('main')).not.toContainText('/invitations/');

		const pending = page.getByRole('region', { name: 'Invitations sent' });
		await expect(pending).toContainText(fresh);
		await pending.getByRole('button', { name: `Withdraw the invitation to ${fresh}` }).click();
		await expect(page.getByText('Withdrawn. That link no longer works.')).toBeVisible();
		await expect(page.getByRole('region', { name: 'Invitations sent' })).not.toContainText(fresh);
	});

	test('a member sees no invite form and no pending invitations', async ({ page }) => {
		test.slow();
		const fixture = await seed(page);
		await signIn(page, fixture.member.email, fixture.member.password);
		await visit(page, `/c/${fixture.slug}/members`);

		await expect(page.getByRole('button', { name: 'Send invitations' })).toHaveCount(0);
		await expect(page.getByRole('region', { name: 'Invitations sent' })).toHaveCount(0);
		// The seed left one invitation pending; a member is not shown it.
		await expect(page.locator('main')).not.toContainText(fixture.invitation.email);
	});
});

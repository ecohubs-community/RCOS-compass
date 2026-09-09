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

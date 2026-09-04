import { expect, test } from '@playwright/test';
import { signIn, visit, type Fixture } from './support.js';

/**
 * `docs/06-testing-strategy.md` §8 describes the Valle Verde fixture, and a
 * fixture that has quietly stopped matching its description is worse than none:
 * screenshots and design review are read as evidence of what the product does.
 * So the shape is asserted, and asserted through the screens rather than against
 * the rows that produced them.
 */
test.describe('the Valle Verde fixture', () => {
	test.slow();

	test('is the lived-in community the mockups show', async ({ page }) => {
		// One project, not four. What this asserts — member count, which layers are
		// answered, that something is still open — is the same at every viewport,
		// and seeding it costs 27 sign-ups at production hashing cost. Run four
		// times over it starves the specs that *are* viewport-dependent, which is
		// how it first showed up: an a11y scan timing out somewhere else entirely.
		test.skip(test.info().project.name !== 'desktop', 'the shape has no viewport');

		const response = await page.request.post('/__test/seed', {
			data: { shape: 'valle-verde' }
		});
		expect(response.ok()).toBe(true);
		const fixture = (await response.json()) as Fixture & {
			valleVerde: {
				members: number;
				answered: { layer0: number; layer1: number };
				decisions: number;
			};
		};

		// 27 members, because a consent round with 27 eligible people behaves
		// differently from one with two — and the mockups show the difference.
		expect(fixture.valleVerde.members).toBe(27);
		expect(fixture.valleVerde.decisions).toBe(
			fixture.valleVerde.answered.layer0 + fixture.valleVerde.answered.layer1
		);

		await signIn(page, fixture.email, fixture.password);
		await visit(page, `/c/${fixture.slug}`);

		// Layer 0 complete, Layer 1 part-written: the two numbers that make the
		// dashboard worth looking at. Read off the bars, not out of the seed.
		const layer0 = page.getByRole('progressbar', { name: /^Layer 0/ });
		await expect(layer0).toHaveAttribute('aria-valuenow', '100');

		const layer1 = Number(
			await page.getByRole('progressbar', { name: /^Layer 1/ }).getAttribute('aria-valuenow')
		);
		expect(layer1).toBeGreaterThan(0);
		expect(layer1).toBeLessThan(100);

		// Overall readiness is somewhere in between: neither an empty community
		// nor a finished one.
		const overall = Number(
			await page
				.getByRole('region', { name: 'Readiness' })
				.getByRole('progressbar', { name: 'Readiness' })
				.getAttribute('aria-valuenow')
		);
		expect(overall).toBeGreaterThan(0);
		expect(overall).toBeLessThan(100);

		// Something still being argued about, and a register with the rest in it.
		await visit(page, `/c/${fixture.slug}/discussions`);
		await expect(page.getByRole('link', { name: 'Can someone leave at any time?' })).toBeVisible();

		await visit(page, `/c/${fixture.slug}/decisions`);
		await expect(page.getByRole('link', { name: /^DEC-\d{4}-\d{3}$/ }).first()).toBeVisible();
	});
});

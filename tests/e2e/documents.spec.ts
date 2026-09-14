import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { seed, signIn, visit } from './support.js';
import { fixturePath } from './fixtures.js';

/**
 * The other way in. `openspec/changes/documents-evidence-ai`, exit criteria.
 *
 *     upload bylaws → extract → map a passage → confirm → the community's own
 *     words, in a definition draft
 *
 * Written before any of it exists and marked `fixme` until it passes, the way
 * the core loop spec was. The claim it is here to keep honest is narrower than
 * "documents work": **this passes with no AI provider at all.** Every step below
 * is one a member does by hand, and the run is the ordinary `AI_PROVIDER=null`
 * one. If this ever needs a model to go green, the promise that the AI is
 * optional has already been broken, and the test is the thing that will say so.
 */

test.describe('a community that already wrote it down', () => {
	test('upload bylaws, map a passage, and get a definition in their own words', async ({
		page
	}) => {
		test.slow();

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		// --- upload -------------------------------------------------------------
		await visit(page, `/c/${slug}/documents`);
		// Said before a file is chosen, naming the community — the documents spec's
		// exact sentence, with the promise the publishing service enforces.
		await expect(
			page.getByText(
				/Every member of .+ will be able to read these files\. Nothing is published outside the community\./
			)
		).toBeVisible();
		await page
			.getByLabel('Drop PDFs, Word files or plain text here')
			.setInputFiles(fixturePath('valle-verde-bylaws.pdf'));
		await page.getByRole('button', { name: 'Upload documents' }).click();

		// The list says what it is doing rather than going quiet: extraction is a
		// job, and a member watching a spinner with no words is a member who
		// assumes it broke.
		const document = page
			.getByRole('listitem')
			.filter({ has: page.getByRole('link', { name: 'valle-verde-bylaws.pdf', exact: true }) });
		await expect(document).toBeVisible();
		await expect(document).toContainText(/Reading|Not scanned/);

		// --- extraction ---------------------------------------------------------
		// The worker polls; the page is reloaded until the status it wrote appears.
		await expect(async () => {
			await page.reload();
			await expect(document).toContainText('Not scanned', { timeout: 2_000 });
		}).toPass({ timeout: 30_000 });
		await document.getByRole('link', { name: /valle-verde-bylaws/ }).click();

		// The passages are the community's own text, not a summary of it.
		const passage = page.getByRole('article').filter({ hasText: 'may leave at any time' });
		await expect(passage).toBeVisible();

		// --- map it, by hand ----------------------------------------------------
		await passage.getByRole('button', { name: 'Map to a clause' }).click();
		const mapping = page.getByRole('region', { name: 'Map this passage' });
		await mapping.getByLabel('Clause').fill('2.1.1');
		await mapping.getByRole('button', { name: 'Confirm' }).click();

		await expect(passage).toContainText('Confirmed');

		// --- what it is, and what it is not -------------------------------------
		// Evidence says "we have language about this". It does not say "we decided
		// this", and the number that means compliance must not move.
		await visit(page, `/c/${slug}`);
		const readiness = page
			.getByRole('region', { name: 'Readiness' })
			.getByRole('progressbar', { name: 'Readiness' });
		await expect(readiness).toHaveAttribute('aria-valuenow', '0');

		// It is shown, and shown separately.
		await expect(page.getByText(/already have language for 1/i)).toBeVisible();

		// --- their own words, in a draft ----------------------------------------
		await visit(page, `/c/${slug}/documents`);
		await page.getByRole('link', { name: /valle-verde-bylaws/ }).click();
		await page
			.getByRole('article')
			.filter({ hasText: 'may leave at any time' })
			.getByRole('button', { name: 'Turn this into a definition' })
			.click();

		// A draft, pre-filled with what they wrote years ago — and still a draft:
		// nothing is adopted until somebody freezes it, and the screen says where
		// the words came from.
		await expect(page.getByRole('heading', { name: /Draft — not adopted/ })).toBeVisible();
		await expect(page.getByText(/may leave at any time/)).toBeVisible();
		await expect(page.getByText(/From your own valle-verde-bylaws\.pdf/)).toBeVisible();
		await expect(page.getByText('Drafting')).toBeVisible();
	});

	test('the whole flow works with no AI provider configured', async ({ page }) => {
		test.slow();

		// The run is already `AI_PROVIDER=null` (playwright.config.ts). This asserts
		// the *absence* of the failure mode: nothing anywhere in the flow tells a
		// member that something is missing or broken because no model is
		// configured. Unavailable is a state the product is designed for, not an
		// error it reports.
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/documents`);
		await page
			.getByLabel('Drop PDFs, Word files or plain text here')
			.setInputFiles(fixturePath('valle-verde-bylaws.pdf'));
		await page.getByRole('button', { name: 'Upload documents' }).click();

		await expect(page.getByRole('alert')).toHaveCount(0);
		// Nothing complains about the absence. Deliberately a phrase match rather
		// than /AI/i, which matches "W-ai-ting to be read" and half the alphabet
		// besides — the first draft of this line did exactly that.
		await expect(
			page.getByText(/no (AI )?provider|AI is (not|un)available|not configured/i)
		).toHaveCount(0);
	});

	test('a real-sized upload reaches the application', async ({ page }) => {
		test.slow();
		/**
		 * The server in front of the application has its own body ceiling
		 * (BODY_SIZE_LIMIT), defaulting to 512 KB — small enough that every
		 * committed fixture sailed under it while real bylaws bounced off it
		 * with a bare 413. This suite runs the adapter-node build with the
		 * production default, and this file exists to actually meet it: built at
		 * test time from the fixture script, never committed as a blob.
		 */
		const { pdf } = await import('../../scripts/make-document-fixtures.mjs');
		const filler = 'Water rights and easements on the north field are held in common. ';
		const big = pdf(Array.from({ length: 25 }, (_, i) => `Page ${i + 1}. ${filler.repeat(3500)}`));
		expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
		const path = test.info().outputPath('five-megabytes.pdf');
		writeFileSync(path, big);

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/documents`);
		await page.getByLabel('Drop PDFs, Word files or plain text here').setInputFiles(path);
		await page.getByRole('button', { name: 'Upload documents' }).click();

		// Through the adapter, through validation, into the list — not a 413.
		await expect(page.getByRole('link', { name: 'five-megabytes.pdf', exact: true })).toBeVisible();
		await expect(page.getByRole('alert')).toHaveCount(0);
	});
});

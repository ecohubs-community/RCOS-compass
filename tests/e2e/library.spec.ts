import { expect, test, type Page } from '@playwright/test';
import { DOCUMENTS, fixturePath } from './fixtures.js';
import { seed, signIn, visit } from './support.js';

/**
 * The library, design 09. `openspec/changes/document-mapping-workspace`, the
 * `document-library` spec.
 *
 * What these keep honest: several files go up as several independent uploads, a
 * member is told before choosing a file who will read it, the filters live in
 * the URL, and the acts behind a row's menu are the ones the member may do —
 * with the server refusing the rest however the request was built.
 */

const DROP = 'Drop PDFs, Word files or plain text here';

async function upload(page: Page, names: string[]) {
	await page.getByLabel(DROP).setInputFiles(names.map((name) => fixturePath(name)));
	await page.getByRole('button', { name: 'Upload documents' }).click();
}

/** The library row for one file — found by its link, not by text the upload results repeat. */
function row(page: Page, filename: string) {
	return page
		.getByRole('listitem')
		.filter({ has: page.getByRole('link', { name: filename, exact: true }) });
}

test.describe('the document library', () => {
	test('three files, one refused, and each says what happened to it', async ({ page }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/documents`);

		await upload(page, [DOCUMENTS.bylawsPdf, DOCUMENTS.wrongType, DOCUMENTS.bylawsDocx]);

		await expect(
			page.getByText(`${DOCUMENTS.bylawsPdf} is uploaded and being read.`)
		).toBeVisible();
		await expect(
			page.getByText(`${DOCUMENTS.bylawsDocx} is uploaded and being read.`)
		).toBeVisible();
		// The refusal of the second never undid the first, nor stopped the third.
		await expect(page.getByText(/^not-really\.pdf was not uploaded: /)).toBeVisible();

		await expect(row(page, DOCUMENTS.bylawsPdf)).toBeVisible();
		await expect(row(page, DOCUMENTS.bylawsDocx)).toBeVisible();
		await expect(row(page, DOCUMENTS.wrongType)).toHaveCount(0);
		await expect(page.getByText(/^2 documents/)).toBeVisible();
	});

	test('eleven files at once are refused whole, before anything is sent', async ({ page }) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/documents`);

		await page.getByLabel(DROP).setInputFiles(
			Array.from({ length: 11 }, (_, i) => ({
				name: `minutes-${i + 1}.txt`,
				mimeType: 'text/plain',
				buffer: Buffer.from(`Minutes of meeting ${i + 1}. The assembly agreed to meet again.`)
			}))
		);
		await page.getByRole('button', { name: 'Upload documents' }).click();

		await expect(page.getByRole('alert')).toHaveText('Upload at most 10 files at once.');
		await expect(page.getByRole('link', { name: /^minutes-/ })).toHaveCount(0);
	});

	test('the notice names the community, word for word, before a file is chosen', async ({
		page
	}) => {
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/documents`);

		// The page title is "Documents · {community}".
		const name = (await page.title()).split(' · ').slice(1).join(' · ');
		expect(name).not.toBe('');
		await expect(
			page.getByText(
				`Every member of ${name} will be able to read these files. Nothing is published outside the community.`,
				{ exact: true }
			)
		).toBeVisible();
	});

	test('the filters change the list, the counts and the URL', async ({ page }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/documents`);
		await upload(page, [DOCUMENTS.bylawsPdf]);

		// Read, and waiting for somebody to start mapping it: "Not mapped".
		await expect(async () => {
			await page.reload();
			await expect(row(page, DOCUMENTS.bylawsPdf)).toContainText('Not scanned', { timeout: 2_000 });
		}).toPass({ timeout: 30_000 });

		const filters = page.getByRole('navigation', { name: 'Show' });
		await expect(filters.getByRole('link', { name: 'Not mapped · 1' })).toBeVisible();
		await expect(filters.getByRole('link', { name: 'Mapped · 0' })).toBeVisible();

		await filters.getByRole('link', { name: 'Mapped · 0' }).click();
		await expect(page).toHaveURL(/\?filter=mapped$/);
		await expect(row(page, DOCUMENTS.bylawsPdf)).toHaveCount(0);
		await expect(page.getByText('No documents match this filter.')).toBeVisible();
		await expect(filters.getByRole('link', { name: 'Mapped · 0' })).toHaveAttribute(
			'aria-current',
			'page'
		);

		await filters.getByRole('link', { name: 'Not mapped · 1' }).click();
		await expect(page).toHaveURL(/\?filter=not_mapped$/);
		await expect(row(page, DOCUMENTS.bylawsPdf)).toBeVisible();
	});

	test("a member's menu offers replacing and versions, not removal — and a crafted removal is refused", async ({
		page,
		browser
	}) => {
		test.slow();
		const { slug, email, password, member } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/documents`);
		await upload(page, [DOCUMENTS.bylawsPdf]);
		await expect(row(page, DOCUMENTS.bylawsPdf)).toBeVisible();
		const href = await row(page, DOCUMENTS.bylawsPdf)
			.getByRole('link', { name: DOCUMENTS.bylawsPdf, exact: true })
			.getAttribute('href');
		const documentId = href!.split('/').pop()!;

		const context = await browser.newContext();
		const other = await context.newPage();
		await signIn(other, member.email, member.password);
		await visit(other, `/c/${slug}/documents`);

		await other.getByLabel(`Actions for ${DOCUMENTS.bylawsPdf}`).click();
		await expect(other.locator('summary', { hasText: 'Replace with a newer file' })).toBeVisible();
		await expect(other.locator('summary', { hasText: 'Remove from library' })).toHaveCount(0);

		// Hiding the item is a courtesy; the service is the lock.
		const response = await other.request.post(`/c/${slug}/documents?/remove`, {
			form: { documentId },
			headers: { origin: new URL(other.url()).origin }
		});
		const body = await response.text();
		const refused =
			response.status() === 403 ||
			(() => {
				try {
					const result = JSON.parse(body) as { type: string; status: number };
					return result.type === 'error' && result.status === 403;
				} catch {
					return false;
				}
			})();
		expect(refused, `a member removed a document: ${response.status()} ${body.slice(0, 200)}`).toBe(
			true
		);
		await context.close();

		await page.reload();
		await expect(row(page, DOCUMENTS.bylawsPdf)).toBeVisible();
	});

	test('replace a file, then bring the earlier one back', async ({ page }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/documents`);
		await upload(page, [DOCUMENTS.bylawsPdf]);
		await expect(row(page, DOCUMENTS.bylawsPdf)).toBeVisible();

		await page.getByLabel(`Actions for ${DOCUMENTS.bylawsPdf}`).click();
		await page.locator('summary', { hasText: 'Replace with a newer file' }).click();
		await page
			.getByLabel('Replace with a newer file', { exact: true })
			.setInputFiles(fixturePath(DOCUMENTS.bylawsDocx));
		await page.getByRole('button', { name: 'Replace', exact: true }).click();

		// Same document, newer file — and the earlier one kept.
		await expect(row(page, DOCUMENTS.bylawsDocx)).toBeVisible();
		await expect(row(page, DOCUMENTS.bylawsPdf)).toHaveCount(0);
		await expect(page.getByText(/^1 document\b/)).toBeVisible();

		const replaced = row(page, DOCUMENTS.bylawsDocx);
		const versions = replaced.locator('summary', { hasText: 'Previous versions (1)' });
		if (!(await versions.isVisible())) {
			await page.getByLabel(`Actions for ${DOCUMENTS.bylawsDocx}`).click();
		}
		await versions.click();
		await expect(
			replaced.getByText(new RegExp(DOCUMENTS.bylawsPdf.replace('.', '\\.')))
		).toBeVisible();
		await replaced.getByRole('button', { name: 'Restore' }).click();

		await expect(row(page, DOCUMENTS.bylawsPdf)).toBeVisible();
		await expect(row(page, DOCUMENTS.bylawsDocx)).toHaveCount(0);
	});
});

test.describe('the document library without JavaScript', () => {
	test('uploads two files in one submission @no-js', async ({ page, browser }) => {
		test.slow();
		const { slug, email, password } = await seed(page);

		// Signing in waits for hydration, which never comes here: sign in with
		// scripts on in a context of its own, and carry the session over.
		const scripted = await browser.newContext({ javaScriptEnabled: true });
		const signing = await scripted.newPage();
		await signIn(signing, email, password);
		await page.context().addCookies((await scripted.storageState()).cookies);
		await scripted.close();

		await page.goto(`/c/${slug}/documents`);
		await page
			.getByLabel(DROP)
			.setInputFiles([fixturePath(DOCUMENTS.bylawsPdf), fixturePath(DOCUMENTS.bylawsDocx)]);
		await page.getByRole('button', { name: 'Upload documents' }).click();

		await expect(
			page.getByText(`${DOCUMENTS.bylawsPdf} is uploaded and being read.`)
		).toBeVisible();
		await expect(
			page.getByText(`${DOCUMENTS.bylawsDocx} is uploaded and being read.`)
		).toBeVisible();
		await expect(row(page, DOCUMENTS.bylawsPdf)).toBeVisible();
		await expect(row(page, DOCUMENTS.bylawsDocx)).toBeVisible();
	});
});

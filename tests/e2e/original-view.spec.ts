import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DOCUMENTS, fixturePath } from './fixtures.js';
import { seed, signIn, visit } from './support.js';

/**
 * A PDF as it was uploaded. `openspec/changes/document-original-view`, the
 * `document-viewer` spec.
 *
 * What these keep honest: the file is drawn from our origin under the real
 * policy with nothing it carries allowed to run or link out; highlights sit on
 * their lines and select their cards both ways; and when the original cannot be
 * shown — no JavaScript, a file pdf.js refuses — the text view is there instead,
 * never an empty pane.
 */

const DROP = 'Drop PDFs, Word files or plain text here';
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Every CSP violation and every navigation away from the workspace, recorded. */
function watchForEscapes(page: Page) {
	const escapes: string[] = [];
	page.on('console', (message) => {
		if (message.text().startsWith('CSP ')) escapes.push(message.text());
	});
	page.on('dialog', (dialog) => {
		escapes.push(`dialog: ${dialog.message()}`);
		void dialog.dismiss();
	});
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame() && !new URL(frame.url()).pathname.includes('/documents')) {
			escapes.push(`navigated: ${frame.url()}`);
		}
	});
	return escapes;
}

async function listenForPolicy(page: Page) {
	await page.addInitScript(() =>
		document.addEventListener('securitypolicyviolation', (event) =>
			console.error(`CSP ${event.violatedDirective} ${event.blockedURI}`)
		)
	);
}

/** Upload, wait until read, and return the workspace URL. */
async function uploaded(page: Page, slug: string, path: string, filename: string) {
	await visit(page, `/c/${slug}/documents`);
	await page.getByLabel(DROP).setInputFiles(path);
	await page.getByRole('button', { name: 'Upload documents' }).click();
	const link = page.getByRole('link', { name: filename, exact: true });
	await expect(async () => {
		await page.reload();
		await expect(page.getByRole('listitem').filter({ has: link })).not.toContainText('Reading', {
			timeout: 2_000
		});
	}).toPass({ timeout: 60_000 });
	return new URL((await link.getAttribute('href'))!, page.url()).toString();
}

/** Map a PDF paragraph by hand through the text view. */
async function mapByHand(page: Page, workspace: string, pageNumber: number, words?: string) {
	await visit(page, `${workspace}?view=text&page=${pageNumber}`);
	const paragraph = page.locator('p[data-passage]').first();
	if (words) {
		await page.evaluate((selected) => {
			const holder = [...document.querySelectorAll('p[data-passage]')].find((el) =>
				el.textContent?.includes(selected)
			)!;
			const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const at = node.textContent!.indexOf(selected);
				if (at < 0) continue;
				const range = document.createRange();
				range.setStart(node, at);
				range.setEnd(node, at + selected.length);
				getSelection()!.removeAllRanges();
				getSelection()!.addRange(range);
				holder.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
				return;
			}
		}, words);
	} else {
		await paragraph.getByRole('link', { name: /^Select ¶\d+$/ }).click();
	}
	const hand = page
		.getByRole('region', { name: /^Map ¶\d+ to a clause$/ })
		.filter({ visible: true });
	if (words) await expect(hand).toContainText('Only the words you selected');
	await hand.getByLabel('Clause').fill('3.6.2');
	await page.keyboard.press('Escape');
	await hand.getByRole('button', { name: 'Map to this clause' }).click();
	await expect(hand).toBeHidden();
}

const originalView = (page: Page) => page.locator('[data-original-view]').filter({ visible: true });

test.describe('the original view of a PDF', () => {
	test('opens at the page in the URL, marks governance pages, and switches to text at the same page', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		await listenForPolicy(page);
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.bylawsPdf),
			DOCUMENTS.bylawsPdf
		);
		await mapByHand(page, workspace, 2);
		await mapByHand(page, workspace, 4);

		const escapes = watchForEscapes(page);
		await visit(page, `${workspace}?page=3`);
		const view = originalView(page);
		await expect(view.getByText('Page 3 of 5')).toBeVisible({ timeout: 20_000 });
		await expect(view.locator('[data-page="3"] canvas')).toBeVisible();

		const strip = view.getByRole('navigation', { name: 'Pages' });
		await expect(strip.locator('[data-governance="true"]')).toHaveCount(2);
		await expect(strip.locator('[data-thumbnail="2"]')).toHaveAttribute('data-governance', 'true');
		await expect(strip.locator('[data-thumbnail="4"]')).toHaveAttribute('data-governance', 'true');

		await strip.locator('[data-thumbnail="5"]').click();
		await expect(view.getByText('Page 5 of 5')).toBeVisible();

		await view.getByRole('link', { name: 'Show as text' }).click();
		await expect(page).toHaveURL(/view=text/);
		await expect(page.getByText(/^Page \d of 5$/).filter({ visible: true })).toBeVisible();
		await expect(originalView(page)).toHaveCount(0);

		expect(escapes).toEqual([]);
	});

	test('a highlight selects its card, a card brings its highlight into view, and keys reach both', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the two panes');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.bylawsPdf),
			DOCUMENTS.bylawsPdf
		);
		await mapByHand(page, workspace, 2);
		await mapByHand(page, workspace, 4);

		await visit(page, workspace);
		const view = originalView(page);
		const first = view.locator('[data-highlight]').first();
		await expect(first).toBeVisible({ timeout: 20_000 });

		// Keyboard: the highlight takes focus, with its paragraph, state and words.
		await first.focus();
		await expect(first).toBeFocused();
		await expect(first).toHaveAttribute('aria-label', /^¶1, mapped: A member may leave/);
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/passage=/);
		const cards = page.locator('article[data-passage-card]');
		await expect(cards.first()).toHaveAttribute('aria-current', 'true');
		await expect(first).toHaveAttribute('aria-pressed', 'true');

		// The card for page 4 brings page 4's highlight into view, selected.
		await cards
			.nth(1)
			.getByRole('link', { name: /Show ¶1 in the document/ })
			.click();
		const later = view.locator('[data-page="4"] [data-highlight]');
		await expect(later).toHaveAttribute('aria-pressed', 'true');
		await expect(later).toBeInViewport();
		await expect(view.getByText('Page 4 of 5')).toBeVisible();
	});

	test('an excerpt inside the second of three lines highlights only that line', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'selecting words, in the two panes');
		const { pdf } = await import('../../scripts/make-document-fixtures.mjs');
		const path = test.info().outputPath('three-lines.pdf');
		writeFileSync(
			path,
			pdf([
				{
					ops: [
						{ x: 72, y: 700, size: 11, text: 'Members of the assembly meet on the first' },
						{ x: 72, y: 684, size: 11, text: 'Tuesday and decide by consent of all present,' },
						{ x: 72, y: 668, size: 11, text: 'recording each decision in the minutes book.' }
					]
				}
			])
		);
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(page, slug, path, 'three-lines.pdf');
		await mapByHand(page, workspace, 1, 'decide by consent');

		await visit(page, workspace);
		const highlight = originalView(page).locator('[data-highlight]');
		await expect(highlight).toBeVisible({ timeout: 20_000 });
		await expect(highlight.locator('span')).toHaveCount(1);
	});

	test('draws thumbnails only as they scroll into the strip', async ({ page }) => {
		test.slow();
		test.skip(!wide(page), 'the page strip');
		const { pdf } = await import('../../scripts/make-document-fixtures.mjs');
		const path = test.info().outputPath('forty-pages.pdf');
		writeFileSync(
			path,
			pdf(Array.from({ length: 40 }, (_, i) => `Page ${i + 1} of the long handbook.`))
		);
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(page, slug, path, 'forty-pages.pdf');

		await visit(page, workspace);
		const strip = originalView(page).getByRole('navigation', { name: 'Pages' });
		await expect(strip.locator('[data-thumbnail="1"] canvas')).toBeVisible({ timeout: 20_000 });
		await expect(strip.locator('[data-thumbnail="40"] canvas')).toHaveCount(0);

		await strip.locator('[data-thumbnail="40"]').scrollIntoViewIfNeeded();
		await expect(strip.locator('[data-thumbnail="40"] canvas')).toHaveCount(1);
	});

	test('falls back to the text, with a sentence and the download, when the file will not render', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.bylawsPdf),
			DOCUMENTS.bylawsPdf
		);

		// The file the browser receives is not a PDF at all.
		await page.route('**/file', (route) =>
			route.fulfill({ status: 200, contentType: 'application/pdf', body: 'This is not a PDF.' })
		);
		await visit(page, workspace);
		await expect(
			page.getByText(
				'This PDF couldn’t be shown as it was uploaded. Here is its text; you can download the original.'
			)
		).toBeVisible({ timeout: 20_000 });
		await expect(page.getByRole('link', { name: 'Download the original' }).first()).toBeVisible();
		await expect(page.getByText('Page 1 of 5').filter({ visible: true })).toBeVisible();
		await expect(originalView(page)).toHaveCount(0);
	});

	test('offers no original view for a Word document', async ({ page }) => {
		test.slow();
		test.skip(!wide(page), 'the two panes');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.bylawsDocx),
			DOCUMENTS.bylawsDocx
		);

		await visit(page, workspace);
		await expect(page.getByRole('article', { name: 'Document text' }).first()).toBeVisible();
		await page.waitForTimeout(1_000);
		await expect(page.locator('[data-original-view]')).toHaveCount(0);
		await expect(page.getByRole('link', { name: /Show the original|Show as text/ })).toHaveCount(0);
	});

	test('a hostile PDF runs nothing, links nowhere, and draws', async ({ page }) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		await listenForPolicy(page);
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.hostileViewer),
			DOCUMENTS.hostileViewer
		);

		const escapes = watchForEscapes(page);
		await visit(page, workspace);
		const view = originalView(page);
		await expect(view.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
		// No link from the file exists anywhere on the page, and clicking where it
		// sits does nothing.
		await expect(page.locator('a[href*="attacker.example"]')).toHaveCount(0);
		await expect(page.locator('.annotationLayer, section[data-annotation-id]')).toHaveCount(0);
		const canvas = view.locator('[data-page="1"]');
		const box = (await canvas.boundingBox())!;
		await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.1);
		await page.waitForTimeout(1_000);

		expect(escapes).toEqual([]);
	});

	test('a page with an enormous image renders and the tab stays responsive', async ({ page }) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.hugeImage),
			DOCUMENTS.hugeImage
		);

		await visit(page, workspace);
		const drawn = originalView(page).locator('[data-page="1"] canvas');
		await expect(drawn).toBeVisible({ timeout: 20_000 });
		const started = Date.now();
		expect(await page.evaluate(() => 1 + 1)).toBe(2);
		expect(Date.now() - started).toBeLessThan(2_000);
		expect(
			await drawn.evaluate((node: HTMLCanvasElement) => node.width * node.height)
		).toBeLessThanOrEqual(16_000_000);
	});

	test('the original view has no accessibility violations', async ({ page }) => {
		test.slow();
		test.skip(!wide(page), 'scanned at 1024 and 1440');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.bylawsPdf),
			DOCUMENTS.bylawsPdf
		);
		await mapByHand(page, workspace, 2);

		await visit(page, workspace);
		await expect(originalView(page).locator('[data-highlight]')).toBeVisible({ timeout: 20_000 });
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});
});

test.describe('what the viewer loads', () => {
	test('the worker, standard fonts and character maps come from our origin, under /_app/', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the original view loads them');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.bylawsPdf),
			DOCUMENTS.bylawsPdf
		);

		const workers: string[] = [];
		page.on('worker', (worker) => workers.push(worker.url()));
		await visit(page, workspace);
		await expect(originalView(page).locator('[data-page="1"] canvas')).toBeVisible({
			timeout: 20_000
		});
		const origin = new URL(page.url()).origin;
		expect(workers.length).toBeGreaterThan(0);
		for (const url of workers) {
			expect(url.startsWith(`${origin}/_app/immutable/`), url).toBe(true);
		}

		const { version } = await import('pdfjs-dist/package.json', { with: { type: 'json' } }).then(
			(module) => module.default
		);
		for (const asset of ['standard_fonts/FoxitSerif.pfb', 'cmaps/78-EUC-H.bcmap']) {
			const response = await page.request.get(`/_app/immutable/pdfjs-${version}/${asset}`);
			expect(response.status(), asset).toBe(200);
		}
	});
});

test.describe('the original view elsewhere', () => {
	test('a phone renders the original page at the width of the screen', async ({ page }) => {
		test.slow();
		test.skip(wide(page), 'the queue widths');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		const workspace = await uploaded(
			page,
			slug,
			fixturePath(DOCUMENTS.bylawsPdf),
			DOCUMENTS.bylawsPdf
		);

		await visit(page, `${workspace}?view=original&page=2`);
		const drawn = originalView(page).locator('[data-page="2"]');
		await expect(drawn.locator('canvas')).toBeVisible({ timeout: 20_000 });
		const box = (await drawn.boundingBox())!;
		const width = page.viewportSize()!.width;
		expect(box.width).toBeGreaterThan(width * 0.75);
		expect(box.x + box.width).toBeLessThanOrEqual(width);
		await expect(page.getByRole('link', { name: '← Back to the queue' })).toBeVisible();
	});

	test('without JavaScript a PDF shows its text @no-js', async ({ page, browser }) => {
		test.slow();
		const { slug, email, password } = await seed(page);
		const scripted = await browser.newContext({ javaScriptEnabled: true });
		const helper = await scripted.newPage();
		await signIn(helper, email, password);
		const workspace = await uploaded(
			helper,
			slug,
			fixturePath(DOCUMENTS.bylawsPdf),
			DOCUMENTS.bylawsPdf
		);
		await page.context().addCookies((await scripted.storageState()).cookies);
		await scripted.close();

		await page.goto(workspace);
		await expect(page.getByText('Page 1 of 5')).toBeVisible();
		await expect(page.getByRole('article', { name: 'Document text' }).first()).toBeVisible();
		await expect(page.locator('[data-original-view]')).toHaveCount(0);
	});
});

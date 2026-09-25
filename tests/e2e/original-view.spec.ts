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

		// Scrolled by hand to page 4 — the URL still says 5 — and switched: the text
		// opens where the member was looking, not where the URL last pointed.
		// (After the viewer's own scroll to page 5 has settled: a person's scroll
		// never lands inside the moment the viewer is moving the page itself.)
		await page.waitForTimeout(600);
		await view.locator('[data-page-slot="4"]').evaluate((slot) => {
			const scroller = slot.closest('.overflow-auto')!;
			scroller.scrollTop = (slot as HTMLElement).offsetTop;
			scroller.dispatchEvent(new Event('scroll'));
		});
		await expect(view.getByText('Page 4 of 5')).toBeVisible();
		await view.getByRole('link', { name: 'Show as text' }).click();
		await expect(page).toHaveURL(/view=text/);
		await expect(page).toHaveURL(/page=4/);
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
		// Page 4's highlight exists — and can take focus — before page 4 is drawn.
		await expect(view.locator('[data-page="4"] [data-highlight]')).toHaveCount(1);

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

	test('lays out no more than a thousand pages of a file that claims more', async ({ page }) => {
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

		// The browser is handed a 1005-page file in place of the bylaws.
		const { pdf } = await import('../../scripts/make-document-fixtures.mjs');
		const long = pdf(Array.from({ length: 1005 }, (_, i) => `Page ${i + 1}.`));
		await page.route('**/file', (route) =>
			route.fulfill({ status: 200, contentType: 'application/pdf', body: long })
		);
		await visit(page, workspace);
		const view = originalView(page);
		await expect(view.getByText(/only its first 1000 pages are shown/)).toBeVisible({
			timeout: 60_000
		});
		await expect(view.locator('[data-page-slot]')).toHaveCount(1000);
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

/**
 * Mapping by hand from a selection. `openspec/changes/pdf-selection-mapping`:
 * words selected — or a paragraph clicked — in the original view reach the same
 * hand-map card as the text view, and in both views the words stored are the
 * occurrence the member selected.
 */

/**
 * Page 1: a heading; ¶1 saying "the council decides" on its first and third
 * lines; ¶2 with "committee" hyphenated across its line break. Pages 2 and 3
 * hold one paragraph each.
 */
function councilPdf(path: string) {
	return import('../../scripts/make-document-fixtures.mjs').then(({ pdf }) =>
		writeFileSync(
			path,
			pdf([
				{
					ops: [
						{ x: 72, y: 720, size: 18, text: 'Membership' },
						{ x: 72, y: 680, size: 11, text: 'In a dispute the council decides first, and the' },
						{ x: 72, y: 664, size: 11, text: 'members may ask for it to be heard again. Then' },
						{ x: 72, y: 648, size: 11, text: 'the council decides last, and records its reasons.' },
						{
							x: 72,
							y: 616,
							size: 11,
							text: 'Quiet hours are agreed each season by the housekeeping commit-'
						},
						{ x: 72, y: 600, size: 11, text: 'tee, and posted on the board beside the kitchen.' }
					]
				},
				'Guests are welcome for a week, and longer stays go to the assembly.',
				'Pets are agreed with the neighbours on either side of the home.'
			])
		)
	);
}

/**
 * Select words in the original view's text layer, from `from.words` in the line
 * reading `from.line` to the end of `to.words` in `to.line`. `pointer` ends it
 * with a pointer-up, as a mouse does; without, only `selectionchange` fires, as
 * when touch handles are dragged.
 */
async function selectInOriginal(
	page: Page,
	from: { line: string; words: string },
	to: { line: string; words: string } = from,
	pointer = true
) {
	await page.evaluate(
		({ from, to, pointer }) => {
			const spans = [
				...document.querySelectorAll<HTMLElement>('[data-original-view] .textLayer span')
			].filter((span) => span.offsetParent !== null);
			const at = (want: { line: string; words: string }, end: boolean) => {
				const span = spans.find((candidate) => candidate.textContent === want.line)!;
				const node = span.firstChild!;
				const index = want.line.lastIndexOf(want.words);
				return { node, offset: end ? index + want.words.length : index, span };
			};
			const start = at(from, false);
			const finish = at(to, true);
			const range = document.createRange();
			range.setStart(start.node, start.offset);
			range.setEnd(finish.node, finish.offset);
			getSelection()!.removeAllRanges();
			getSelection()!.addRange(range);
			if (pointer) finish.span.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		},
		{ from, to, pointer }
	);
}

const LINE = {
	a1: 'In a dispute the council decides first, and the',
	a2: 'members may ask for it to be heard again. Then',
	a3: 'the council decides last, and records its reasons.',
	b1: 'Quiet hours are agreed each season by the housekeeping commit-',
	b2: 'tee, and posted on the board beside the kitchen.',
	page3: 'Pets are agreed with the neighbours on either side of the home.'
};

const handCard = (page: Page, number: number) =>
	page.getByRole('region', { name: `Map ¶${number} to a clause` }).filter({ visible: true });

async function openCouncil(page: Page, query = '') {
	const path = test.info().outputPath('council.pdf');
	await councilPdf(path);
	const { slug, email, password } = await seed(page);
	await signIn(page, email, password);
	const workspace = await uploaded(page, slug, path, 'council.pdf');
	await visit(page, `${workspace}${query}`);
	const view = originalView(page);
	await expect(view.locator('.textLayer span', { hasText: LINE.b2 })).toHaveCount(1, {
		timeout: 20_000
	});
	return { workspace, view };
}

async function submitClause(page: Page, card: ReturnType<typeof handCard>) {
	await card.getByLabel('Clause').fill('3.6.2');
	await page.keyboard.press('Escape');
	await card.getByRole('button', { name: 'Map to this clause' }).click();
	await expect(card).toBeHidden();
}

/** The vertical middle of a text-layer line, and of a drawn box, to compare which line is which. */
const middleOf = async (locator: import('@playwright/test').Locator) => {
	const box = (await locator.boundingBox())!;
	return box.y + box.height / 2;
};

test.describe('mapping by hand from the original view', () => {
	test('selected words become the excerpt, shown on the page, kept out of the URL, and mapped to their line', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		const { view } = await openCouncil(page);

		await selectInOriginal(page, { line: LINE.b2, words: 'posted on the board' });
		const card = handCard(page, 2);
		await expect(card).toContainText('Only the words you selected: “posted on the board”');
		await expect(page).toHaveURL(/passage=/);
		expect(page.url()).not.toContain('posted');
		await expect(view.locator('[data-pending-line]')).toHaveCount(1);

		await submitClause(page, card);
		const highlight = view.locator('[data-highlight]');
		await expect(highlight).toHaveCount(1);
		await expect(highlight.locator('span')).toHaveCount(1);
		const drawn = await middleOf(highlight.locator('span'));
		const line = await middleOf(view.locator('.textLayer span', { hasText: LINE.b2 }));
		expect(Math.abs(drawn - line)).toBeLessThan(8);
	});

	test('finds a hyphenated word as stored, and the occurrence of a repeated phrase that was selected', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		const { view } = await openCouncil(page);

		await selectInOriginal(
			page,
			{ line: LINE.b1, words: 'housekeeping' },
			{ line: LINE.b2, words: 'tee' }
		);
		await expect(handCard(page, 2)).toContainText('“housekeeping committee”');

		await selectInOriginal(page, { line: LINE.a3, words: 'the council decides' });
		const card = handCard(page, 1);
		await expect(card).toContainText('“the council decides”');
		const pending = view.locator('[data-pending-line]');
		await expect(pending).toHaveCount(1);
		const third = await middleOf(view.locator('.textLayer span', { hasText: LINE.a3 }));
		expect(Math.abs((await middleOf(pending)) - third)).toBeLessThan(8);
	});

	test('a click selects a whole paragraph in place; headings, and selections across paragraphs, are not mapped', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		const { view } = await openCouncil(page);
		const scroller = view.locator('[data-original-scroller]');

		const before = await scroller.evaluate((node) => node.scrollTop);
		await view.locator('.textLayer span', { hasText: LINE.a2 }).click();
		const card = handCard(page, 1);
		await expect(card).toContainText('otherwise the whole paragraph is mapped');
		await expect(view.locator('[data-pending-line]')).toHaveCount(3);
		expect(Math.abs((await scroller.evaluate((node) => node.scrollTop)) - before)).toBeLessThan(2);

		const url = page.url();
		await selectInOriginal(page, { line: 'Membership', words: 'Membership' });
		await page.waitForTimeout(600);
		expect(page.url()).toBe(url);
		await expect(card).not.toContainText('Only the words you selected');

		await selectInOriginal(
			page,
			{ line: LINE.a3, words: 'records its reasons' },
			{ line: LINE.b1, words: 'Quiet hours' }
		);
		await expect(
			page.getByText('That selection runs across two paragraphs.').filter({ visible: true })
		).toBeVisible();
		await expect(card).not.toContainText('Only the words you selected');
	});

	test('a selection made without a pointer, on a page other than the one in the URL, settles into the card', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the original is the default at 1024px and wider');
		const { view } = await openCouncil(page, '?page=1');

		const slot = view.locator('[data-page-slot="3"]');
		await slot.scrollIntoViewIfNeeded();
		await expect(view.locator('.textLayer span', { hasText: LINE.page3 })).toHaveCount(1, {
			timeout: 20_000
		});
		await selectInOriginal(
			page,
			{ line: LINE.page3, words: 'agreed with the neighbours' },
			undefined,
			false
		);
		await expect(handCard(page, 1)).toContainText('“agreed with the neighbours”');
		await expect(slot).toBeInViewport();
	});

	test('the text view stores the occurrence selected, and refuses a selection across paragraphs', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'selecting words, in the two panes');
		const { workspace } = await openCouncil(page);
		await visit(page, `${workspace}?view=text&page=1`);

		const select = (from: string, to: string | null) =>
			page.evaluate(
				({ from, to }) => {
					const holders = [...document.querySelectorAll<HTMLElement>('p[data-passage]')].filter(
						(el) => el.offsetParent !== null
					);
					const textIn = (holder: HTMLElement, words: string) => {
						const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
						for (let node = walker.nextNode(); node; node = walker.nextNode()) {
							const at = node.textContent!.lastIndexOf(words);
							if (at >= 0) return { node, at };
						}
						throw new Error(`no "${words}"`);
					};
					const start = holders.find((el) => el.textContent!.includes(from))!;
					const end = to ? holders.find((el) => el.textContent!.includes(to))! : start;
					const a = textIn(start, from);
					const b = to ? textIn(end, to) : a;
					const range = document.createRange();
					range.setStart(a.node, a.at);
					range.setEnd(b.node, b.at + (to ?? from).length);
					getSelection()!.removeAllRanges();
					getSelection()!.addRange(range);
					end.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
				},
				{ from, to }
			);

		await select('records its reasons', 'Quiet hours');
		await expect(
			page.getByText('That selection runs across two paragraphs.').filter({ visible: true })
		).toBeVisible();

		// The last occurrence, on the paragraph's third line.
		await select('the council decides', null);
		const card = handCard(page, 1);
		await expect(card).toContainText('“the council decides”');
		await submitClause(page, card);

		await visit(page, `${workspace}?view=original`);
		const highlight = originalView(page).locator('[data-highlight] span');
		await expect(highlight).toHaveCount(1, { timeout: 20_000 });
		const third = await middleOf(
			originalView(page).locator('.textLayer span', { hasText: LINE.a3 })
		);
		expect(Math.abs((await middleOf(highlight)) - third)).toBeLessThan(8);
	});
});

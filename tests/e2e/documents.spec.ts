import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seed, signIn, visit } from './support.js';
import { DOCUMENTS, fixturePath } from './fixtures.js';

/**
 * The other way in: a community that already wrote it down. Designs 05, 09 and
 * 16b; `openspec/changes/document-mapping-workspace`.
 *
 *     upload bylaws → read them as text → map a passage → confirm → the
 *     community's own words, in a definition draft
 *
 * The claim the first test keeps honest is narrower than "documents work":
 * **it passes with no AI provider at all.** `playwright.ai.config.ts` runs this
 * same file with the fixture provider, where the scan test runs too — so
 * nothing on the manual path quietly depends on a model, and the model path is
 * driven end to end with the same answer every time.
 */

const DROP = 'Drop PDFs, Word files or plain text here';

/** Upload files and wait until the named one has been read. */
async function upload(page: Page, slug: string, paths: string[], filename: string) {
	await visit(page, `/c/${slug}/documents`);
	await page.getByLabel(DROP).setInputFiles(paths);
	await page.getByRole('button', { name: 'Upload documents' }).click();
	const link = page.getByRole('link', { name: filename, exact: true });
	await expect(link).toBeVisible();
	await expect(async () => {
		await page.reload();
		await expect(page.getByRole('listitem').filter({ has: link })).not.toContainText('Reading', {
			timeout: 2_000
		});
	}).toPass({ timeout: 60_000 });
	return link;
}

async function open(page: Page, slug: string, paths: string[], filename: string) {
	await (await upload(page, slug, paths, filename)).click();
	await expect(page.getByRole('heading', { level: 1, name: filename })).toBeVisible();
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

/** A text file written at test time, so what is inside it is right here in the test. */
function textFile(name: string, body: string): string {
	const path = test.info().outputPath(name);
	writeFileSync(path, body);
	return path;
}

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test.describe('a community that already wrote it down', () => {
	test('upload bylaws, map a passage by hand, finish, and get a definition in their own words', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the two panes; the queue has its own test below');

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await open(page, slug, [fixturePath(DOCUMENTS.bylawsPdf)], DOCUMENTS.bylawsPdf);

		// --- read it as text, a page at a time ---------------------------------
		// A PDF opens as the original at this width (original-view.spec.ts); the
		// text view is where words are selected and mapped by hand.
		await visit(page, `${page.url()}?view=text`);
		await expect(page.getByText('Page 1 of 5')).toBeVisible();
		await page.getByRole('link', { name: 'Page 2', exact: true }).first().click();
		await expect(page).toHaveURL(/page=2/);
		const passage = page.locator('p[data-passage]').filter({ hasText: 'may leave at any time' });
		await expect(passage).toBeVisible();

		// --- map it, by hand ----------------------------------------------------
		await passage.getByRole('link', { name: 'Select ¶1' }).click();
		await expect(page).toHaveURL(/passage=/);
		const hand = page.getByRole('region', { name: 'Map ¶1 to a clause' });
		await hand.getByLabel('Clause').fill('3.6.2');
		await page.keyboard.press('Escape');
		await hand.getByRole('button', { name: 'Map to this clause' }).click();

		const card = page.locator('article[data-passage-card]');
		await expect(card).toContainText('§3.6.2');
		await expect(card).toContainText(/Mapped · confirmed by .+, /);
		await expect(passage.locator('mark')).toHaveText(/may leave at any time/);

		// --- finish --------------------------------------------------------------
		// Hand-mapped and never scanned: nothing says it is done until a member does.
		await expect(page.getByText('Mapping in progress').filter({ visible: true })).toBeVisible();
		await expect(
			page.getByText('Every identified passage has an answer.').filter({ visible: true })
		).toBeVisible();
		await page.getByRole('button', { name: 'Mark mapping as done' }).click();
		await expect(
			page.getByText('Mapped', { exact: true }).filter({ visible: true }).first()
		).toBeVisible();

		// --- what it is, and what it is not -------------------------------------
		// Evidence says "we have language about this". It does not say "we decided
		// this", and the number that means compliance must not move.
		const here = page.url();
		await visit(page, `/c/${slug}`);
		const readiness = page
			.getByRole('region', { name: 'Readiness' })
			.getByRole('progressbar', { name: 'Readiness' });
		await expect(readiness).toHaveAttribute('aria-valuenow', '0');
		await expect(page.getByText(/already have language for 1/i)).toBeVisible();

		// --- their own words, in a draft ----------------------------------------
		await visit(page, here);
		await page.getByRole('button', { name: 'Turn into definition →' }).click();
		await expect(page.getByRole('heading', { name: /Draft — not adopted/ })).toBeVisible();
		await expect(page.getByText(/may leave at any time/)).toBeVisible();
		await expect(page.getByText(/From your own valle-verde-bylaws\.pdf/)).toBeVisible();
	});

	test('with a provider: start a scan, read the reasons, correct a suggestion', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the two panes');

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);

		await visit(page, `/c/${slug}/settings/ai`);
		const switchOn = page.getByRole('button', { name: 'Switch it on' });
		test.skip(!(await switchOn.isVisible()), 'runs under playwright.ai.config.ts, with a provider');
		await switchOn.click();
		await expect(page.getByRole('button', { name: 'Switch it off' })).toBeVisible();

		await open(page, slug, [fixturePath(DOCUMENTS.bylawsPdf)], DOCUMENTS.bylawsPdf);

		// The estimate before anything is spent.
		await expect(
			page.getByText('Compass will read 5 paragraphs.').filter({ visible: true })
		).toBeVisible();
		await page
			.getByRole('button', { name: 'Start RCOS mapping' })
			.filter({ visible: true })
			.click();

		// The page follows the scan without a reload, and stops when it ends.
		const card = page.locator('article[data-passage-card]');
		await expect(card).toContainText('§3.6.2', { timeout: 30_000 });
		await expect(card).toContainText('Says how a member leaves');
		// A reason, never a strength.
		await expect(card).not.toContainText(/\d+\s*%|confidence|strong|partial/i);
		await expect(
			page.getByText('✦ AI-drafted · nothing is applied until you confirm')
		).toBeVisible();

		// The requirement, on demand.
		await card.getByRole('button', { name: 'What §3.6.2 requires' }).click();
		await expect(card.getByText(/RCOS-Core v0\.1 · §3\.6\.2/)).toBeVisible();
		await expect(card.getByRole('link', { name: 'Open in Standard →' })).toHaveAttribute(
			'href',
			/#clause-3\.6\.2$/
		);
		await card.getByRole('button', { name: 'Hide' }).click();

		// Correct it by typing words, not a number.
		await card.getByText('Change clause').click();
		await card.getByLabel('Clause').fill('voluntary exit');
		await page.getByRole('option', { name: /§3\.6\.1/ }).click();
		await card.getByRole('button', { name: 'Confirm this clause instead' }).click();

		const cards = page.locator('article[data-passage-card]');
		await expect(cards.filter({ hasText: '§3.6.1' })).toContainText('Mapped · confirmed by');
		await expect(cards.filter({ hasText: '§3.6.2' })).toContainText('Dismissed');
		// Scanned to the end with nothing open: mapped, with no button to press.
		await expect(
			page.getByText('Mapped', { exact: true }).filter({ visible: true }).first()
		).toBeVisible();
	});

	test('the whole flow works with no AI provider configured', async ({ page }) => {
		test.slow();

		// The run is already `AI_PROVIDER=null` (playwright.config.ts). This asserts
		// the *absence* of the failure mode: nothing tells a member that something
		// is missing or broken because no model is configured.
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await open(page, slug, [fixturePath(DOCUMENTS.bylawsPdf)], DOCUMENTS.bylawsPdf);

		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(
			page.getByText(/no (AI )?provider|AI is (not|un)available|not configured/i)
		).toHaveCount(0);
	});

	test('a real-sized upload reaches the application', async ({ page }) => {
		test.slow();
		/**
		 * The server in front of the application has its own body ceiling
		 * (BODY_SIZE_LIMIT). This suite runs the adapter-node build with the
		 * production setting, and this file exists to actually meet it: built at
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
		await page.getByLabel(DROP).setInputFiles(path);
		await page.getByRole('button', { name: 'Upload documents' }).click();

		// Through the adapter, through validation, into the list — not a 413.
		await expect(page.getByRole('link', { name: 'five-megabytes.pdf', exact: true })).toBeVisible();
		await expect(page.getByRole('alert')).toHaveCount(0);
	});
});

test.describe('the text view', () => {
	test('a Word document shows its headings, paragraphs and outline', async ({ page }) => {
		test.slow();
		test.skip((page.viewportSize()?.width ?? 0) < 1280, 'the outline strip is shown from 1280px');
		const { docx } = await import('../../scripts/make-document-fixtures.mjs');
		const path = test.info().outputPath('handbook.docx');
		writeFileSync(
			path,
			docx([
				{ heading: 'Membership' },
				'A member may leave at any time.',
				'Their share is settled within thirty days.',
				{ heading: 'Meetings' },
				'The assembly meets monthly.',
				{ heading: 'Money' },
				'The treasurer publishes the balances.'
			])
		);

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await open(page, slug, [path], 'handbook.docx');

		const outline = page.getByRole('navigation', { name: 'Contents' });
		await expect(outline.getByRole('link')).toHaveText(['Membership', 'Meetings', 'Money']);
		const sheet = page.getByRole('article', { name: 'Document text' });
		await expect(sheet.getByRole('heading', { name: 'Membership' })).toBeVisible();
		// ¶ counts paragraphs, never headings.
		await expect(sheet.getByRole('link', { name: 'Select ¶2' })).toBeVisible();
		await expect(sheet.getByText('Their share is settled within thirty days.')).toBeVisible();
	});

	test('hostile text renders as words, and an excerpt highlights only its sentence', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'selecting words with a mouse, in the two panes');
		const path = textFile(
			'agreements.txt',
			[
				'Members agree <script>window.__pwned = 1</script> and <img src=x onerror="window.__pwned = 1"> in writing.',
				'',
				'A member may leave at any time. They give sixty days notice to the assembly.'
			].join('\n')
		);

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await open(page, slug, [path], 'agreements.txt');

		const sheet = page.getByRole('article', { name: 'Document text' });
		await expect(
			sheet.getByText('<script>window.__pwned = 1</script>', { exact: false })
		).toBeVisible();
		expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();

		// Select the second sentence, the way a mouse would.
		const sentence = 'They give sixty days notice to the assembly.';
		await page.evaluate((words) => {
			const paragraph = [...document.querySelectorAll('p[data-passage]')].find((el) =>
				el.textContent?.includes(words)
			)!;
			const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const at = node.textContent!.indexOf(words);
				if (at < 0) continue;
				const range = document.createRange();
				range.setStart(node, at);
				range.setEnd(node, at + words.length);
				getSelection()!.removeAllRanges();
				getSelection()!.addRange(range);
				paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
				return;
			}
		}, sentence);

		const hand = page.getByRole('region', { name: /^Map ¶\d to a clause$/ });
		await expect(hand).toContainText(`Only the words you selected: “${sentence}”`);
		await hand.getByLabel('Clause').fill('3.6.2');
		await page.keyboard.press('Escape');
		await hand.getByRole('button', { name: 'Map to this clause' }).click();

		const paragraph = sheet.locator('p[data-passage]').filter({ hasText: sentence });
		await expect(paragraph.locator('mark')).toHaveText(sentence);
	});

	test('text, pages and mapping by hand all work without JavaScript @no-js', async ({
		page,
		browser
	}) => {
		test.slow();
		const { slug, email, password } = await seed(page);

		// Signing in and uploading wait for hydration, so they happen with scripts
		// on in a context of their own; the session is carried over.
		const scripted = await browser.newContext({ javaScriptEnabled: true });
		const helper = await scripted.newPage();
		await signIn(helper, email, password);
		const link = await upload(
			helper,
			slug,
			[fixturePath(DOCUMENTS.bylawsPdf)],
			DOCUMENTS.bylawsPdf
		);
		const href = (await link.getAttribute('href'))!;
		await page.context().addCookies((await scripted.storageState()).cookies);
		await scripted.close();

		await page.goto(href);
		await expect(page.getByText('Page 1 of 5')).toBeVisible();
		await page.getByRole('link', { name: 'Page 2', exact: true }).first().click();
		await expect(page.getByText('may leave at any time')).toBeVisible();

		// Mapping by hand posts the typed reference: no combobox, no script.
		await page.getByRole('link', { name: 'Select ¶1' }).click();
		const hand = page.getByRole('region', { name: 'Map ¶1 to a clause' });
		await hand.getByLabel('Clause').fill('3.6.2');
		await hand.getByRole('button', { name: 'Map to this clause' }).click();
		await expect(page.locator('article[data-passage-card]')).toContainText('§3.6.2');
		await expect(page).toHaveURL(/passage=/);

		const download = await page.request.get(
			(await page.getByRole('link', { name: 'Download the original' }).getAttribute('href'))!
		);
		expect(download.ok()).toBe(true);
		expect(download.headers()['content-type']).toContain('application/pdf');
	});
});

test.describe('the workspace by keyboard', () => {
	test('page navigation, selecting a paragraph, the clause picker and finishing all answer to keys', async ({
		page
	}) => {
		test.slow();
		test.skip(!wide(page), 'the two panes');
		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await open(page, slug, [fixturePath(DOCUMENTS.bylawsPdf)], DOCUMENTS.bylawsPdf);
		await visit(page, `${page.url()}?view=text`);

		await page.getByRole('link', { name: 'Page 2', exact: true }).first().focus();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/page=2/);

		await page.getByRole('link', { name: 'Select ¶1' }).focus();
		await page.keyboard.press('Enter');
		const hand = page.getByRole('region', { name: 'Map ¶1 to a clause' });
		const clause = hand.getByLabel('Clause');
		await clause.focus();
		await page.keyboard.type('voluntary exit');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(clause).toHaveValue(/^3\.6\.\d$/);
		await hand.getByRole('button', { name: 'Map to this clause' }).focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('article[data-passage-card]')).toContainText('Mapped · confirmed by');

		await page.getByRole('button', { name: 'Mark mapping as done' }).focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('button', { name: 'Reopen mapping' })).toBeVisible();
	});
});

test.describe('the queue below 1024 pixels', () => {
	test('a phone member maps by hand and marks mapping as done', async ({ page }) => {
		test.slow();
		test.skip(wide(page), 'the queue is for narrower screens');

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await open(page, slug, [fixturePath(DOCUMENTS.bylawsPdf)], DOCUMENTS.bylawsPdf);

		// The queue, not two panes.
		await expect(page.getByRole('region', { name: 'Mapping' })).toBeHidden();
		await expect(page.getByText('0 of 0 done')).toBeVisible();

		await page.getByRole('link', { name: 'see it in the page' }).click();
		await page.getByRole('link', { name: 'Page 2', exact: true }).click();
		await page.getByRole('link', { name: 'Select ¶1' }).click();
		const hand = page.getByRole('region', { name: 'Map ¶1 to a clause' }).filter({ visible: true });
		await hand.getByLabel('Clause').fill('3.6.2');
		await page.keyboard.press('Escape');
		await hand.getByRole('button', { name: 'Map to this clause' }).click();

		await page.getByRole('link', { name: '← Back to the queue' }).click();
		await expect(
			page.getByText('Every identified passage has an answer.').filter({ visible: true })
		).toBeVisible();
		await expect(page.getByText('1 of 1 done')).toBeVisible();

		const done = page
			.getByRole('button', { name: 'Mark mapping as done' })
			.filter({ visible: true });
		const box = await done.boundingBox();
		expect(box!.height, 'a touch target').toBeGreaterThanOrEqual(44);
		await done.click();
		await expect(
			page.getByText('Mapped', { exact: true }).filter({ visible: true }).first()
		).toBeVisible();

		// Nothing desktop-only: the confirmed claim still turns into a definition here.
		await expect(
			page.getByRole('button', { name: 'Turn into definition →' }).filter({ visible: true })
		).toBeVisible();
	});

	test('with a provider: a phone member scans, reads a passage and confirms it', async ({
		page
	}) => {
		test.slow();
		test.skip(wide(page), 'the queue is for narrower screens');

		const { slug, email, password } = await seed(page);
		await signIn(page, email, password);
		await visit(page, `/c/${slug}/settings/ai`);
		const switchOn = page.getByRole('button', { name: 'Switch it on' });
		test.skip(!(await switchOn.isVisible()), 'runs under playwright.ai.config.ts, with a provider');
		await switchOn.click();
		await expect(page.getByRole('button', { name: 'Switch it off' })).toBeVisible();

		await open(page, slug, [fixturePath(DOCUMENTS.bylawsPdf)], DOCUMENTS.bylawsPdf);
		await page
			.getByRole('button', { name: 'Start RCOS mapping' })
			.filter({ visible: true })
			.click();

		// Step one: the passage, and where it is.
		await expect(page.getByText('Passage 1 of 1')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/page 2, ¶1/)).toBeVisible();
		await page.getByRole('link', { name: 'Next: the suggested ref' }).click();
		await expect(page).toHaveURL(/step=confirm/);

		// Step two: the ref, the reason, and what confirming does not do.
		await expect(
			page.getByText('Says how a member leaves').filter({ visible: true })
		).toBeVisible();
		await expect(
			page.getByText(
				'Confirming does not adopt this language. It records that your documents already speak to this ref.'
			)
		).toBeVisible();
		const confirm = page.getByRole('button', { name: 'Confirm §3.6.2' });
		expect((await confirm.boundingBox())!.height, 'a touch target').toBeGreaterThanOrEqual(44);
		await confirm.click();

		await expect(page.getByText('1 of 1 done')).toBeVisible();
		await expect(
			page.getByText('Every identified passage has an answer.').filter({ visible: true })
		).toBeVisible();
		await expect(page).toHaveURL(/step=read/);
	});
});

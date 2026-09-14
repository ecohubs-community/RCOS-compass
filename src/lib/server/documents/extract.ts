import { getConfig } from '../config.js';
import { inlineText, parseMarkdown, type BlockNode } from '../markdown.js';
import type { AcceptedType } from './sniff.js';
import workerCode from './extract-worker.js?raw';

/**
 * Turning a stored file into passages. docs/04-security.md §5.2.
 *
 * Split in two since `document-paragraphs`. **Parsing** — the part that touches
 * the hostile bytes — runs in a worker thread (`extract-worker.js`) that the
 * deadline actually *terminates*: the old `Promise.race` could name a deadline
 * but not enforce one, because a parser that never yields never lets the timer
 * fire. The worker also runs under a heap ceiling, so a decompression or parser
 * bug is a failed document, not a dead job runner.
 *
 * **Heuristics** — everything that turns inert parser output into passages —
 * stay here, typed and unit-testable. For a PDF that means geometry: pdf.js
 * hands back one item per text run with a transform, and paragraph boundaries
 * are found from vertical gaps, font-size changes and indents, because the
 * joined-up text has already thrown the only evidence of a paragraph away.
 * That failure was concrete: every PDF page used to become one passage.
 *
 * The outcome vocabulary is unchanged and matters more than the parsing.
 * `reference_only` is a success: the file is kept and a person can read it,
 * Compass just cannot. Presenting it as an empty document would tell a
 * community their bylaws say nothing.
 */

/** Bumped when the reading itself changes; jobs/reread.ts re-reads what is below. */
export const EXTRACTOR_VERSION = 2;

/** One line of a PDF passage: where it sits, and which slice of the text it carries. */
export type LineBox = { x: number; y: number; w: number; h: number; start: number; end: number };

export type ExtractedPassage = {
	page: number;
	ordinal: number;
	kind: 'heading' | 'paragraph';
	text: string;
	/** Line boxes in unrotated PDF user space; null for formats without a page. */
	bbox: LineBox[] | null;
};

export type Extraction =
	| {
			kind: 'extracted';
			passages: ExtractedPassage[];
			pagesTotal: number;
			pagesExtracted: number;
	  }
	| { kind: 'reference_only'; reason: string };

export class ExtractionFailed extends Error {
	constructor(readonly reason: string) {
		super(reason);
		this.name = 'ExtractionFailed';
	}
}

// --- What the worker sends back ---------------------------------------------

/**
 * One text run, as a compact tuple: `[str, x, y, width, fontHeight]` in the
 * page's unrotated user space. A tuple rather than pdf.js's item object because
 * up to 300 pages of these cross the worker boundary in one structured clone,
 * and an object repeats its key names per item — several times the bytes.
 */
export type RawItem = [str: string, x: number, y: number, w: number, fontH: number];
export type RawPage = { width: number; height: number; items: RawItem[] };
export type RawParse =
	| { kind: 'pdf'; pagesTotal: number; pages: RawPage[] }
	| { kind: 'docx'; html: string }
	| { kind: 'odt'; xml: string | null }
	| { kind: 'md'; text: string }
	| { kind: 'txt'; text: string };

// --- PDF geometry ------------------------------------------------------------
//
// Thresholds, named and in one place. Tuned against the fixtures; a bad split
// costs a member a paragraph boundary, never data.

/**
 * Items whose baselines differ by at most this share of the font height are one
 * line. Loose enough to take a superscript footnote marker (raised ~0.35em) into
 * its line instead of splitting the paragraph around it; tight enough that the
 * next line, at least one leading away, never joins.
 */
const LINE_TOLERANCE = 0.45;
/** A horizontal gap wider than this share of the font height gets a joining space. */
const WORD_GAP = 0.15;
/**
 * A horizontal gap wider than this many font heights splits a baseline into
 * fragments. Two columns share baselines; merging across a gutter would read the
 * page as full-width lines before column detection ever ran. 1.5em sits above
 * justified word spacing and below the narrowest ordinary gutter.
 */
const FRAGMENT_GAP = 1.5;
/** A vertical gap above this multiple of the median line gap starts a paragraph. */
const PARAGRAPH_GAP = 1.5;
/** A font-height change above this share starts a paragraph. */
const FONT_CHANGE = 0.15;
/** A gutter wider than this share of the page width can separate two columns. */
const COLUMN_GUTTER = 0.05;
/**
 * Each column must run at least this share of the page's text height. What
 * tells two columns from a table: a table's columns are a few rows tall.
 */
const COLUMN_SPAN = 0.5;
/** Larger than the page's body text by this factor, and short, means a heading. */
const HEADING_SCALE = 1.2;
const HEADING_MAX_CHARS = 120;
/** The existing floor: a passage someone can map has to say something. */
const MIN_CHARS = 3;

type Line = {
	x: number;
	right: number;
	y: number;
	fontH: number;
	text: string;
};

/**
 * Group a page's items into lines by baseline, then split each baseline into
 * fragments at wide gaps. Linear after the sort: items arrive top to bottom, so
 * the only line an item can belong to is the one being built — comparing
 * against every earlier line made a page of distinct baselines quadratic, and
 * this runs on the server's main thread.
 */
export function linesOf(items: RawItem[]): Line[] {
	type Building = { y: number; fontH: number; parts: { x: number; w: number; str: string }[] };
	const buildings: Building[] = [];

	const glyphs = items
		.filter(([str]) => str.trim().length > 0)
		.sort((a, b) => b[2] - a[2] || a[1] - b[1]);

	for (const [str, x, y, w, fontH] of glyphs) {
		const line = buildings.at(-1);
		if (line && Math.abs(line.y - y) <= LINE_TOLERANCE * Math.max(line.fontH, fontH)) {
			line.parts.push({ x, w, str });
			// The line's baseline is its body text's, not a superscript's.
			if (fontH > line.fontH) {
				line.fontH = fontH;
				line.y = y;
			}
		} else {
			buildings.push({ y, fontH, parts: [{ x, w, str }] });
		}
	}

	return buildings
		.flatMap((line) => {
			const parts = [...line.parts].sort((a, b) => a.x - b.x);
			const fragments: Line[] = [];
			let text = '';
			let x = parts[0]?.x ?? 0;
			let right = x;
			const flush = () => {
				const clean = text.replace(/\s+/g, ' ').trim();
				if (clean.length > 0)
					fragments.push({ x, right, y: line.y, fontH: line.fontH, text: clean });
			};
			for (const part of parts) {
				if (text !== '' && part.x - right > FRAGMENT_GAP * line.fontH) {
					flush();
					text = '';
					x = part.x;
				} else if (text !== '' && part.x - right > WORD_GAP * line.fontH) {
					text += ' ';
				}
				text += part.str;
				right = Math.max(right, part.x + part.w);
			}
			flush();
			return fragments;
		})
		.sort((a, b) => b.y - a.y || a.x - b.x);
}

/**
 * One or two columns — a heuristic with fixtures, not a layout engine.
 *
 * Two only when all of these hold, because each one alone is fooled by
 * something common in bylaws:
 * - the line starts cluster into two bands across a gutter (alone: fooled by
 *   hanging indents, whose starts also cluster);
 * - nothing in the left band runs past the gutter (rules out indents: a
 *   top-level line runs across where its sub-clauses start);
 * - each band holds a real share of the lines and runs most of the page's text
 *   height (rules out a table, whose columns are a few rows tall).
 * Lines spanning the gutter above the columns (a title) read with the left band.
 */
export function columnsOf(lines: Line[], pageWidth: number): Line[][] {
	if (lines.length < 6) return [lines];

	const starts = [...new Set(lines.map((line) => Math.round(line.x)))].sort((a, b) => a - b);
	let boundary: number | null = null;
	let widest = pageWidth * COLUMN_GUTTER;
	for (let i = 1; i < starts.length; i++) {
		const gap = starts[i]! - starts[i - 1]!;
		if (gap > widest) {
			widest = gap;
			boundary = (starts[i]! + starts[i - 1]!) / 2;
		}
	}
	if (boundary === null) return [lines];
	const gutter = boundary;

	const left = lines.filter((line) => line.x < gutter);
	const right = lines.filter((line) => line.x >= gutter);
	if (left.length < lines.length / 3 || right.length < lines.length / 3) return [lines];

	// Body lines of a real left column end before the right column begins —
	// judged against where the right column actually starts, not the midpoint
	// between the bands, which a wide left column crosses. Lines above the right
	// column's top are allowed: a title may span both.
	const rightTop = Math.max(...right.map((line) => line.y));
	const rightStart = Math.min(...right.map((line) => line.x));
	if (left.some((line) => line.y <= rightTop && line.right > rightStart)) return [lines];

	const spanOf = (band: Line[]) =>
		Math.max(...band.map((line) => line.y)) - Math.min(...band.map((line) => line.y));
	const pageSpan = Math.max(1, spanOf(lines));
	if (spanOf(left) < COLUMN_SPAN * pageSpan || spanOf(right) < COLUMN_SPAN * pageSpan) {
		return [lines];
	}

	return [left, right];
}

type Grouped = { fontH: number; text: string; boxes: LineBox[] };

/** Lines to paragraphs, joining wrapped lines and re-joining hyphenated words. */
function groupParagraphs(column: Line[]): Grouped[] {
	if (column.length === 0) return [];

	const gaps = column
		.slice(1)
		.map((line, i) => column[i]!.y - line.y)
		.filter((gap) => gap > 0)
		.sort((a, b) => a - b);
	// The *lower* median: with two gaps — one leading, one paragraph break —
	// the upper median is the break itself, and nothing would ever split.
	const medianGap = gaps[Math.floor((gaps.length - 1) / 2)] ?? column[0]!.fontH * 1.2;
	const columnLeft = Math.min(...column.map((line) => line.x));
	const columnRight = Math.max(...column.map((line) => line.right));
	const columnWidth = Math.max(1, columnRight - columnLeft);

	const groups: Line[][] = [];
	let current: Line[] = [];
	for (const line of column) {
		const previous = current.at(-1);
		// Fragments on the same baseline — table cells, a split line — always
		// continue; the rules below are about the step down to a new line.
		const breaks =
			previous !== undefined &&
			previous.y - line.y > 0.5 * Math.min(previous.fontH, line.fontH) &&
			(previous.y - line.y > PARAGRAPH_GAP * medianGap ||
				Math.abs(line.fontH - previous.fontH) > FONT_CHANGE * previous.fontH ||
				(line.x - columnLeft > line.fontH && previous.right < columnRight - 0.15 * columnWidth));
		if (breaks) {
			groups.push(current);
			current = [];
		}
		current.push(line);
	}
	if (current.length > 0) groups.push(current);

	return groups.map((lines) => {
		let text = '';
		const boxes: LineBox[] = [];
		for (const line of lines) {
			let joiner = text === '' ? '' : ' ';
			// A word split with a hyphen at the line break comes back whole.
			if (/[\p{L}]-$/u.test(text) && /^\p{Ll}/u.test(line.text)) {
				text = text.slice(0, -1);
				const previous = boxes.at(-1);
				if (previous) previous.end -= 1;
				joiner = '';
			}
			const start = text.length + joiner.length;
			text = text + joiner + line.text;
			boxes.push({
				x: line.x,
				y: line.y,
				w: line.right - line.x,
				h: line.fontH,
				start,
				end: text.length
			});
		}
		return { fontH: Math.max(...lines.map((line) => line.fontH)), text, boxes };
	});
}

/**
 * The page's body text size: the font height under which half the page's
 * *characters* sit. Weighted by characters rather than by lines, because a
 * short heading line is one line but a handful of characters — a line-count
 * median lets a page that is half headings call its headings body text.
 */
export function bodyHeightOf(lines: Line[]): number {
	const byHeight = [...lines].sort((a, b) => a.fontH - b.fontH);
	const total = byHeight.reduce((sum, line) => sum + line.text.length, 0);
	let seen = 0;
	for (const line of byHeight) {
		seen += line.text.length;
		if (seen * 2 >= total) return line.fontH;
	}
	return byHeight.at(-1)?.fontH ?? 10;
}

/** Paragraphs and headings for one page, with their line boxes. */
export function pdfPagePassages(page: RawPage): Omit<ExtractedPassage, 'page' | 'ordinal'>[] {
	const lines = linesOf(page.items);
	if (lines.length === 0) return [];

	const bodyHeight = bodyHeightOf(lines);
	const grouped = columnsOf(lines, page.width).flatMap((column) => groupParagraphs(column));

	return grouped
		.filter((group) => group.text.length >= MIN_CHARS)
		.map((group) => ({
			kind:
				group.fontH >= HEADING_SCALE * bodyHeight && group.text.length < HEADING_MAX_CHARS
					? ('heading' as const)
					: ('paragraph' as const),
			text: group.text,
			bbox: group.boxes
		}));
}

function pdfExtraction(raw: { pagesTotal: number; pages: RawPage[] }): Extraction {
	const passages: ExtractedPassage[] = [];
	raw.pages.forEach((page, index) => {
		pdfPagePassages(page).forEach((item, ordinal) => {
			passages.push({ page: index + 1, ordinal, ...item });
		});
	});

	// Pages that exist and produce no text at all are what a scan looks like to
	// an extractor. Said out loud, never presented as a document about nothing.
	if (passages.length === 0) {
		return {
			kind: 'reference_only',
			reason:
				'This looks like a scan — the pages carry an image of text rather than text itself. ' +
				'Compass keeps the file for people to read, but cannot extract passages from it.'
		};
	}

	return {
		kind: 'extracted',
		passages,
		pagesTotal: raw.pagesTotal,
		// What the worker actually returned — it stops at the page ceiling —
		// rather than a second computation of what it was supposed to return.
		pagesExtracted: raw.pages.length
	};
}

// --- Word, ODT, Markdown, plain text -----------------------------------------

type Block = { kind: 'heading' | 'paragraph'; text: string };

/** XML/HTML character references, decoded without any parser in the loop. */
function decodeEntities(value: string): string {
	return value
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

function safeCodePoint(code: number): string {
	// Control characters and lone surrogates decode to nothing rather than to
	// bytes that later confuse a renderer.
	if (!Number.isFinite(code) || code < 0x20 || (code >= 0xd800 && code <= 0xdfff)) return '';
	try {
		return String.fromCodePoint(code);
	} catch {
		return '';
	}
}

/**
 * mammoth's HTML, walked tag by tag. The HTML is never stored and never
 * rendered — headings and paragraphs come out as text, exactly like every other
 * format. Exported for the hostile-fixture tests.
 *
 * A scanner rather than a `<(p|li)>…</\1>` regex, because Word's multi-level
 * numbering arrives as nested lists — `<li>Membership<ul><li>Admission</li>` —
 * and a regex match ends at the *inner* `</li>`, gluing a clause to its first
 * sub-clause. Here every block opening or closing ends the text before it, so
 * each item is its own passage however deeply it nests. Tags are stripped
 * before entities are decoded, so `&lt;script&gt;` survives as words.
 */
export function docxBlocks(html: string): Block[] {
	const blocks: Block[] = [];
	let kind: Block['kind'] = 'paragraph';
	let buffer = '';

	const flush = () => {
		const text = decodeEntities(buffer).replace(/\s+/g, ' ').trim();
		if (text.length >= MIN_CHARS) blocks.push({ kind, text });
		buffer = '';
	};

	for (const token of html.split(/(<[^>]*>)/)) {
		const tag = /^<\/?\s*([a-z0-9]+)/i.exec(token)?.[1]?.toLowerCase();
		if (tag === undefined) {
			buffer += token;
		} else if (/^(h[1-6]|p|li)$/.test(tag)) {
			flush();
			if (!token.startsWith('</')) kind = tag.startsWith('h') ? 'heading' : 'paragraph';
		} else if (/^(br|ul|ol|table|tr|td|th)$/.test(tag)) {
			// Structure between words is a word boundary.
			buffer += ' ';
		}
		// Inline markup (strong, em, a, …) adds nothing: Word splits one word
		// across runs, and a space at every run boundary would split it too.
	}
	flush();
	return blocks;
}

/** Exported for the hostile-fixture tests, which feed it the bad XML directly. */
export function odtParagraphs(xml: string): Block[] {
	if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
		throw new ExtractionFailed(
			'This OpenDocument file declares custom XML entities, which no real document does. Compass refuses it.'
		);
	}

	const blocks: Block[] = [];
	// `text:p` and `text:h` hold every word a person typed; the rest of the
	// vocabulary is styling and structure this reader has no use for.
	for (const match of xml.matchAll(/<text:(p|h)\b[^>]*>([\s\S]*?)<\/text:\1>/g)) {
		const inner = match[2]!
			.replace(/<text:tab[^>]*\/>/g, ' ')
			.replace(/<text:line-break[^>]*\/>/g, '\n')
			.replace(/<[^>]+>/g, '');
		const text = decodeEntities(inner).replace(/\s+/g, ' ').trim();
		if (text.length >= MIN_CHARS) {
			blocks.push({ kind: match[1] === 'h' ? 'heading' : 'paragraph', text });
		}
	}
	return blocks;
}

/**
 * Markdown through the same parser members' text goes through — new wiring
 * since `document-paragraphs`; it used to be read as plain text. Heading nodes
 * become headings; list items become one passage each.
 */
export function markdownBlocks(source: string): Block[] {
	const blocks: Block[] = [];
	const walk = (nodes: BlockNode[]): void => {
		for (const node of nodes) {
			switch (node.type) {
				case 'heading':
					push('heading', inlineText(node.children));
					break;
				case 'paragraph':
					push('paragraph', inlineText(node.children));
					break;
				case 'list':
					for (const item of node.items) walk(item);
					break;
				case 'quote':
					walk(node.children);
					break;
				case 'code':
					push('paragraph', node.value);
					break;
				case 'rule':
					break;
			}
		}
	};
	const push = (kind: Block['kind'], text: string) => {
		const clean = text.replace(/\s+/g, ' ').trim();
		if (clean.length >= MIN_CHARS) blocks.push({ kind, text: clean });
	};
	walk(parseMarkdown(source));
	return blocks;
}

/**
 * Split plain text into readable paragraphs. Blank lines divide paragraphs;
 * single newlines are line wrapping. Tiny fragments are dropped: a passage
 * someone can map to a clause has to say something.
 */
function paragraphsOf(text: string): Block[] {
	return text
		.split(/\n\s*\n/)
		.map((block) => block.replace(/\s+/g, ' ').trim())
		.filter((block) => block.length >= MIN_CHARS)
		.map((block) => ({ kind: 'paragraph' as const, text: block }));
}

/** Formats without pages: everything is page 1, and the count says so. */
function singlePage(blocks: Block[]): Extraction {
	if (blocks.length === 0) {
		return {
			kind: 'reference_only',
			reason: 'Compass could not find any readable text in this document.'
		};
	}
	return {
		kind: 'extracted',
		passages: blocks.map((block, ordinal) => ({
			page: 1,
			ordinal,
			kind: block.kind,
			text: block.text,
			bbox: null
		})),
		pagesTotal: 1,
		pagesExtracted: 1
	};
}

// --- The worker around the parsing -------------------------------------------

/**
 * Compass could not *attempt* the reading — the file is missing, a parser
 * module would not load, the worker died for a reason that is not the file's.
 * Not a verdict on the document, so the job records nothing permanent: see
 * `extract-job.ts`, which keeps any earlier reading and lets the next boot's
 * re-read sweep try again, instead of calling a readable file damaged forever.
 */
export class ExtractionUnavailable extends Error {
	constructor(readonly cause: string) {
		super(`Extraction could not be attempted: ${cause}`);
		this.name = 'ExtractionUnavailable';
	}
}

/** Error codes that describe the machine, not the file. */
const ENVIRONMENT_CODES = new Set([
	'ENOENT',
	'EACCES',
	'EPERM',
	'EISDIR',
	'ENOTDIR',
	'EMFILE',
	'ENFILE',
	'EIO',
	'MODULE_NOT_FOUND',
	'ERR_MODULE_NOT_FOUND',
	'ERR_REQUIRE_ESM'
]);

type WorkerAnswer =
	{ ok: true; raw: RawParse } | { ok: false; message: string; code: string | null };

/**
 * Parse the file in a worker thread and terminate it at the deadline.
 *
 * `code` is injectable so the tests can prove the mechanism itself — a worker
 * that never yields is terminated, one that exhausts the heap fails readably,
 * one that cannot load its parser is not mistaken for a damaged file — without
 * needing a file that genuinely does any of that.
 */
export async function parseInWorker(
	input: { path: string; type: AcceptedType },
	options: {
		deadlineMs: number;
		maxHeapMb: number;
		limits: { maxPages: number; maxUnzipBytes: number };
	},
	code: string = workerCode
): Promise<RawParse> {
	const { Worker } = await import('node:worker_threads');
	const worker = new Worker(code, {
		eval: true,
		workerData: {
			path: input.path,
			type: input.type,
			resolveFrom: import.meta.url,
			limits: options.limits
		},
		resourceLimits: { maxOldGenerationSizeMb: options.maxHeapMb }
	});

	const answer = new Promise<RawParse>((resolve, reject) => {
		worker.once('message', (message: WorkerAnswer) => {
			if (message.ok) resolve(message.raw);
			else if (message.code !== null && ENVIRONMENT_CODES.has(message.code)) {
				reject(new ExtractionUnavailable(`${message.code}: ${message.message}`));
			} else reject(parseFailure(message.message, input.type));
		});
		worker.once('error', (problem: NodeJS.ErrnoException) => {
			reject(
				problem.code === 'ERR_WORKER_OUT_OF_MEMORY'
					? new ExtractionFailed(
							'Reading this document needed more memory than Compass allows, so it stopped. The file is kept.'
						)
					: // An uncaught throw inside the worker itself, outside the parse's own
						// try — the worker machinery, not the document.
						new ExtractionUnavailable(String(problem.message ?? problem))
			);
		});
		worker.once('exit', (exitCode) => {
			// Only reached when neither message nor error arrived first.
			if (exitCode !== 0) reject(new ExtractionUnavailable(`worker exited with ${exitCode}`));
		});
	});

	try {
		return await withDeadline(answer, options.deadlineMs);
	} finally {
		// Idempotent, and the enforcement: a parse still running past the
		// deadline is stopped here, not merely abandoned.
		await worker.terminate();
	}
}

/** A parser's complaint, mapped to a sentence a member can act on. */
function parseFailure(message: string, type: AcceptedType): ExtractionFailed {
	if (type === 'pdf' && /password|encrypt/i.test(message)) {
		return new ExtractionFailed(
			'This PDF is encrypted. Compass cannot read it; export an unprotected copy and upload that.'
		);
	}
	if (type === 'pdf') {
		return new ExtractionFailed('This PDF could not be read. It may be damaged.');
	}
	if (type === 'docx') {
		return new ExtractionFailed('This Word document could not be read. It may be damaged.');
	}
	if (type === 'odt') {
		return new ExtractionFailed(
			'This OpenDocument file could not be read. It may be damaged, or larger inside than allowed.'
		);
	}
	return new ExtractionFailed('This document could not be read. It may be damaged.');
}

/**
 * Extract a stored file, under a deadline that is actually enforced.
 *
 * The deadline lives here rather than with the job runner's own timeout,
 * because the two mean different things: the runner's timeout abandons a run to
 * be retried, and retrying a file that takes forever takes forever again, five
 * times, and then dead-letters — with the document stuck saying "extracting"
 * throughout. This one produces a *result* the handler records on the document,
 * in words a member reads.
 *
 * Throws `ExtractionFailed` for a verdict on the file, and
 * `ExtractionUnavailable` when the reading could not be attempted at all.
 */
export async function extract(
	path: string,
	type: AcceptedType,
	deadlineMs: number
): Promise<Extraction> {
	const config = getConfig();
	const raw = await parseInWorker(
		{ path, type },
		{
			deadlineMs,
			maxHeapMb: config.EXTRACT_MAX_HEAP_MB,
			limits: { maxPages: config.MAX_EXTRACT_PAGES, maxUnzipBytes: config.maxUnzipBytes }
		}
	);

	switch (raw.kind) {
		case 'pdf':
			return pdfExtraction(raw);
		case 'docx':
			return singlePage(docxBlocks(raw.html));
		case 'odt':
			if (raw.xml === null) throw parseFailure('', 'odt');
			return singlePage(odtParagraphs(raw.xml));
		case 'md':
			return singlePage(markdownBlocks(raw.text));
		case 'txt':
			return singlePage(paragraphsOf(raw.text));
	}
}

/**
 * Exported so the deadline can be tested for what it is.
 *
 * Racing a real one-millisecond deadline against a real parse is a coin toss —
 * the first version of that test passed and then failed on a warm module cache.
 * The mechanism is what matters, and a promise that never settles proves it
 * every time.
 */
export async function withDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new ExtractionFailed(
						`Reading this document took longer than ${Math.round(deadlineMs / 1000)} seconds, so Compass stopped. The file is kept; a smaller or simpler export of it may work.`
					)
				),
			deadlineMs
		);
	});

	try {
		return await Promise.race([work, deadline]);
	} finally {
		clearTimeout(timer);
	}
}

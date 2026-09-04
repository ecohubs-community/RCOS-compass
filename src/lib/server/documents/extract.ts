import { readFile } from 'node:fs/promises';
import { getConfig } from '../config.js';
import type { AcceptedType } from './sniff.js';
import { readZipEntry } from './zip.js';

/**
 * Turning a stored file into passages. docs/04-security.md §5.2.
 *
 * Extraction runs in a job, on a file that already passed the upload envelope —
 * but "already checked" is a statement about the wrapper, not the contents, so
 * everything here still treats the file as hostile: ceilings on what a zip may
 * inflate to, a page ceiling with the remainder *reported*, and a deadline the
 * caller enforces around the whole thing.
 *
 * The outcome vocabulary matters more than the parsing. `reference_only` is a
 * success: the file is kept and a person can read it, Compass just cannot. It is
 * what a scan produces, and presenting it as an empty document would tell a
 * community their bylaws say nothing.
 */

export type ExtractedPassage = { page: number; ordinal: number; text: string };

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

/**
 * Split one page's text into readable paragraphs.
 *
 * Blank lines divide paragraphs; single newlines inside a block are the line
 * wrapping of the source layout, not structure, so they become spaces. Tiny
 * fragments — page numbers, stray bullets — are dropped: a passage someone can
 * map to a clause has to say something.
 */
function paragraphsOf(pageText: string): string[] {
	return pageText
		.split(/\n\s*\n/)
		.map((block) => block.replace(/\s+/g, ' ').trim())
		.filter((block) => block.length >= 3);
}

async function fromPdf(path: string): Promise<Extraction> {
	const { extractText } = await import('unpdf');
	const config = getConfig();

	let pagesTotal: number;
	let pages: string[];
	try {
		const result = await extractText(new Uint8Array(await readFile(path)), {
			mergePages: false
		});
		pagesTotal = result.totalPages;
		pages = result.text;
	} catch (problem) {
		const message = String((problem as Error).message ?? problem);
		if (/password|encrypt/i.test(message)) {
			throw new ExtractionFailed(
				'This PDF is encrypted. Compass cannot read it; export an unprotected copy and upload that.'
			);
		}
		throw new ExtractionFailed('This PDF could not be read. It may be damaged.');
	}

	const ceiling = config.MAX_EXTRACT_PAGES;
	const within = pages.slice(0, ceiling);

	const passages: ExtractedPassage[] = [];
	within.forEach((pageText, index) => {
		paragraphsOf(pageText).forEach((text, ordinal) => {
			passages.push({ page: index + 1, ordinal, text });
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
		pagesTotal,
		pagesExtracted: Math.min(pagesTotal, ceiling)
	};
}

async function fromDocx(path: string): Promise<Extraction> {
	const mammoth = await import('mammoth');

	let text: string;
	try {
		text = (await mammoth.extractRawText({ path })).value;
	} catch {
		throw new ExtractionFailed('This Word document could not be read. It may be damaged.');
	}

	return singlePage(paragraphsOf(text));
}

/**
 * ODT, by reading `content.xml` ourselves — the decision recorded in the change's
 * design: no maintained reader exists, RCOS publishes its templates in this
 * format, and the file is a zip with one XML file that matters.
 *
 * The XML handling refuses DTDs outright rather than configuring them off:
 * there is no DTD processing here to switch off, no entity expansion beyond the
 * five the XML spec predefines plus numeric references, and no external
 * anything. A document that *carries* a DOCTYPE is refused, because the only
 * reason for one in a content.xml is to be a bomb.
 */
async function fromOdt(path: string): Promise<Extraction> {
	const config = getConfig();
	const content = await readZipEntry(path, 'content.xml', config.MAX_UNZIP_MB * 1024 * 1024);
	if (!content) {
		throw new ExtractionFailed(
			'This OpenDocument file could not be read. It may be damaged, or larger inside than allowed.'
		);
	}

	return singlePage(odtParagraphs(content.toString('utf8')));
}

/** Exported for the hostile-fixture tests, which feed it the bad XML directly. */
export function odtParagraphs(xml: string): string[] {
	if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
		throw new ExtractionFailed(
			'This OpenDocument file declares custom XML entities, which no real document does. Compass refuses it.'
		);
	}

	const decode = (value: string) =>
		value
			.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
			.replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&amp;/g, '&');

	const paragraphs: string[] = [];
	// `text:p` and `text:h` hold every word a person typed; the rest of the
	// vocabulary is styling and structure this reader has no use for.
	for (const match of xml.matchAll(/<text:(p|h)\b[^>]*>([\s\S]*?)<\/text:\1>/g)) {
		const inner = match[2]!
			.replace(/<text:tab[^>]*\/>/g, ' ')
			.replace(/<text:line-break[^>]*\/>/g, '\n')
			.replace(/<[^>]+>/g, '');
		const text = decode(inner).replace(/\s+/g, ' ').trim();
		if (text.length >= 3) paragraphs.push(text);
	}
	return paragraphs;
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

async function fromPlainText(path: string): Promise<Extraction> {
	const text = await readFile(path, 'utf8');
	return singlePage(paragraphsOf(text));
}

/** Formats without pages: everything is page 1, and the count says so. */
function singlePage(paragraphs: string[]): Extraction {
	if (paragraphs.length === 0) {
		return {
			kind: 'reference_only',
			reason: 'Compass could not find any readable text in this document.'
		};
	}
	return {
		kind: 'extracted',
		passages: paragraphs.map((text, ordinal) => ({ page: 1, ordinal, text })),
		pagesTotal: 1,
		pagesExtracted: 1
	};
}

const EXTRACTORS: Record<AcceptedType, (path: string) => Promise<Extraction>> = {
	pdf: fromPdf,
	docx: fromDocx,
	odt: fromOdt,
	md: fromPlainText,
	txt: fromPlainText
};

/**
 * Extract a stored file, under a deadline.
 *
 * The deadline is enforced here rather than left to the job runner's own
 * timeout, because the two mean different things: the runner's timeout abandons
 * a run to be retried, and retrying a file that takes forever takes forever
 * again, five times, and then dead-letters — with the document stuck saying
 * "extracting" throughout. This one produces a *result* the handler records on
 * the document, in words a member reads.
 */
export async function extract(
	path: string,
	type: AcceptedType,
	deadlineMs: number
): Promise<Extraction> {
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
		return await Promise.race([EXTRACTORS[type](path), deadline]);
	} finally {
		clearTimeout(timer);
	}
}

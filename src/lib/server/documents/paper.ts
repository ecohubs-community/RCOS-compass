import type { InlineNode } from '$lib/shared/markdown';
import { inlineText, parseMarkdown } from '../markdown.js';

/**
 * The text view of a document, as the screen draws it. The change's
 * `document-viewer` spec.
 *
 * Pure: passages and the claims on them in, sheets out. Passage text is the most
 * hostile text in the product — it did not even come from a member typing — so
 * it goes through the markdown node pipeline like everything else, and an
 * excerpt is highlighted by splitting the *source* text and parsing each piece,
 * never by wrapping rendered HTML.
 */

export type Highlight = 'none' | 'open' | 'confirmed';

export type PaperSegment = { marked: boolean; nodes: InlineNode[] };

export type PaperPassage = {
	id: string;
	page: number;
	kind: 'heading' | 'paragraph';
	/** ¶ within its page, counting paragraphs only; null for a heading. */
	number: number | null;
	highlight: Highlight;
	segments: PaperSegment[];
	/** The source text, so a text selection can be turned into offsets into it. */
	text: string;
};

export type Paper = {
	/** A PDF has pages to move between; every other format is one sheet. */
	paged: boolean;
	/** The page shown, for a paged document. */
	page: number | null;
	pageCount: number;
	/** Headings, for the outline strip of a sheet with no pages. */
	outline: { id: string; text: string }[];
	/** The passages on the sheet shown. */
	passages: PaperPassage[];
};

type PassageRow = {
	id: string;
	page: number;
	ordinal: number;
	kind: 'heading' | 'paragraph';
	text: string;
};

type ClaimRow = {
	passageId: string | null;
	state: 'suggested' | 'confirmed' | 'dismissed' | 'stale';
	excerptStart: number | null;
	excerptEnd: number | null;
};

/**
 * Inline nodes for a piece of passage text. A paragraph passage is one
 * paragraph; if the markdown reading of it is anything else — "1. Members may…"
 * reads as a list, "# 4" as a heading — the words are shown as they are, since
 * the document said them, not a member formatting them.
 */
export function inlineNodes(source: string): InlineNode[] {
	if (source === '') return [];
	const blocks = parseMarkdown(source);
	const nodes: InlineNode[] =
		blocks.length === 1 && blocks[0]!.type === 'paragraph'
			? blocks[0]!.children
			: source.trim()
				? [{ type: 'text', value: source.trim() }]
				: [];
	// The spaces either side are the seams between segments. Whether the parser
	// kept them depends on how many there were, so they are put back only where
	// the words it returned have lost them.
	const words = inlineText(nodes);
	const space: InlineNode = { type: 'text', value: ' ' };
	return [
		...(/^\s/.test(source) && !/^\s/.test(words) ? [space] : []),
		...nodes,
		...(/\s$/.test(source) && words && !/\s$/.test(words) ? [space] : [])
	];
}

/**
 * The ranges to highlight in a passage: every live claim's excerpt, merged — or
 * the whole passage, if any live claim is about all of it.
 */
export function highlightRanges(
	text: string,
	claims: Pick<ClaimRow, 'excerptStart' | 'excerptEnd'>[]
): [number, number][] {
	if (claims.length === 0) return [];
	const ranges: [number, number][] = [];
	for (const claim of claims) {
		const { excerptStart: start, excerptEnd: end } = claim;
		if (start === null || end === null || start < 0 || end > text.length || start >= end) {
			return [[0, text.length]];
		}
		ranges.push([start, end]);
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const range of ranges) {
		const last = merged.at(-1);
		if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
		else merged.push([...range]);
	}
	return merged;
}

function segmentsOf(text: string, ranges: [number, number][]): PaperSegment[] {
	if (ranges.length === 0) return [{ marked: false, nodes: inlineNodes(text) }];
	const out: PaperSegment[] = [];
	let at = 0;
	for (const [start, end] of ranges) {
		if (start > at) out.push({ marked: false, nodes: inlineNodes(text.slice(at, start)) });
		out.push({ marked: true, nodes: inlineNodes(text.slice(start, end)) });
		at = end;
	}
	if (at < text.length) out.push({ marked: false, nodes: inlineNodes(text.slice(at)) });
	return out.filter((segment) => segment.nodes.length > 0);
}

/** ¶ numbers per passage: paragraphs counted within their page, headings skipped. */
export function paragraphNumbers(rows: PassageRow[]): Map<string, number> {
	const numbers = new Map<string, number>();
	const perPage = new Map<number, number>();
	for (const row of [...rows].sort((a, b) => a.page - b.page || a.ordinal - b.ordinal)) {
		if (row.kind !== 'paragraph') continue;
		const next = (perPage.get(row.page) ?? 0) + 1;
		perPage.set(row.page, next);
		numbers.set(row.id, next);
	}
	return numbers;
}

export function buildPaper(input: {
	paged: boolean;
	pagesTotal: number | null;
	passages: PassageRow[];
	claims: ClaimRow[];
	/** `?page=`, as asked. */
	page: number | null;
	/** `?passage=` — its page wins over `?page=`, so selecting a card shows its page. */
	selected: string | null;
}): Paper {
	const rows = [...input.passages].sort((a, b) => a.page - b.page || a.ordinal - b.ordinal);
	const numbers = paragraphNumbers(rows);
	const live = new Map<string, ClaimRow[]>();
	for (const claim of input.claims) {
		if (!claim.passageId || claim.state === 'stale' || claim.state === 'dismissed') continue;
		live.set(claim.passageId, [...(live.get(claim.passageId) ?? []), claim]);
	}

	const lastPage = rows.at(-1)?.page ?? 1;
	const pageCount = input.paged ? Math.max(input.pagesTotal ?? 0, lastPage, 1) : 1;
	const selectedPage = rows.find((row) => row.id === input.selected)?.page ?? null;
	const asked =
		input.page !== null && input.page >= 1 && input.page <= pageCount ? input.page : null;
	const page = input.paged ? (selectedPage ?? asked ?? rows[0]?.page ?? 1) : null;

	const shown = page === null ? rows : rows.filter((row) => row.page === page);

	return {
		paged: input.paged,
		page,
		pageCount,
		outline: input.paged
			? []
			: rows.filter((row) => row.kind === 'heading').map((row) => ({ id: row.id, text: row.text })),
		passages: shown.map((row) => {
			const claims = row.kind === 'paragraph' ? (live.get(row.id) ?? []) : [];
			const highlight: Highlight = claims.some((claim) => claim.state === 'confirmed')
				? 'confirmed'
				: claims.length > 0
					? 'open'
					: 'none';
			return {
				id: row.id,
				page: row.page,
				kind: row.kind,
				number: numbers.get(row.id) ?? null,
				highlight,
				segments: segmentsOf(row.text, highlightRanges(row.text, claims)),
				text: row.text
			};
		})
	};
}

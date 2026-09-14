import { describe, expect, it } from 'vitest';
import {
	buildPaper,
	highlightRanges,
	inlineNodes,
	paragraphNumbers
} from '../../src/lib/server/documents/paper.js';
import { inlineText } from '../../src/lib/server/markdown.js';

/**
 * The text view's sheets: which passages a page shows, how they are numbered,
 * and what is highlighted — without a database or a browser.
 */
const row = (
	id: string,
	page: number,
	ordinal: number,
	kind: 'heading' | 'paragraph' = 'paragraph',
	text = `Passage ${id}.`
) => ({ id, page, ordinal, kind, text });

const words = (segments: { nodes: Parameters<typeof inlineText>[0] }[]) =>
	segments.map((segment) => inlineText(segment.nodes)).join('');

describe('paragraph numbers', () => {
	it('counts paragraphs within their page and skips headings', () => {
		const numbers = paragraphNumbers([
			row('h', 4, 0, 'heading'),
			row('a', 4, 1),
			row('b', 4, 2),
			row('c', 5, 0)
		]);
		expect(numbers.get('b')).toBe(2);
		expect(numbers.get('c')).toBe(1);
		expect(numbers.has('h')).toBe(false);
	});
});

describe('highlight ranges', () => {
	const text = 'A member may leave. They give sixty days notice.';

	it('highlights only the excerpt', () => {
		expect(highlightRanges(text, [{ excerptStart: 0, excerptEnd: 19 }])).toEqual([[0, 19]]);
	});

	it('highlights the whole passage when any claim has no excerpt', () => {
		expect(
			highlightRanges(text, [
				{ excerptStart: 0, excerptEnd: 19 },
				{ excerptStart: null, excerptEnd: null }
			])
		).toEqual([[0, text.length]]);
	});

	it('merges overlapping excerpts, and treats an impossible range as the whole passage', () => {
		expect(
			highlightRanges(text, [
				{ excerptStart: 20, excerptEnd: 30 },
				{ excerptStart: 0, excerptEnd: 22 }
			])
		).toEqual([[0, 30]]);
		expect(highlightRanges(text, [{ excerptStart: 10, excerptEnd: 999 }])).toEqual([
			[0, text.length]
		]);
	});
});

describe('inline nodes', () => {
	it('keeps a hostile passage as words', () => {
		const nodes = inlineNodes(
			'Members <script>alert(1)</script> <img src=x onerror=alert(1)> agree.'
		);
		expect(JSON.stringify(nodes)).not.toMatch(/"type":"(html|image)"/);
		expect(inlineText(nodes)).toContain('Members');
	});

	it('shows a paragraph that reads as a list exactly as the document said it', () => {
		expect(inlineText(inlineNodes('1. Members may leave.'))).toBe('1. Members may leave.');
	});
});

describe('the sheet', () => {
	const passages = [
		row('h', 4, 0, 'heading', 'Article IV — Membership'),
		row('p1', 4, 1),
		row('p2', 4, 2, 'paragraph', 'A member may leave. They give sixty days notice.'),
		row('p3', 7, 0)
	];

	it('shows the page asked for, or the page of the selected passage', () => {
		const base = { paged: true, pagesTotal: 11, passages, claims: [] };
		expect(buildPaper({ ...base, page: 7, selected: null }).passages.map((p) => p.id)).toEqual([
			'p3'
		]);
		const selected = buildPaper({ ...base, page: 7, selected: 'p2' });
		expect(selected.page).toBe(4);
		expect(selected.pageCount).toBe(11);
		expect(selected.passages.map((p) => p.id)).toEqual(['h', 'p1', 'p2']);
	});

	it('falls back to the first page with text for a page that does not exist', () => {
		expect(
			buildPaper({ paged: true, pagesTotal: 11, passages, claims: [], page: 99, selected: null })
				.page
		).toBe(4);
	});

	it('is one sheet with an outline when the format has no pages', () => {
		const paper = buildPaper({
			paged: false,
			pagesTotal: null,
			passages,
			claims: [],
			page: 3,
			selected: null
		});
		expect(paper.page).toBeNull();
		expect(paper.passages).toHaveLength(4);
		expect(paper.outline).toEqual([{ id: 'h', text: 'Article IV — Membership' }]);
	});

	it('marks confirmed over open, ignores dismissed and stale, and highlights the excerpt', () => {
		const paper = buildPaper({
			paged: true,
			pagesTotal: 11,
			passages,
			page: 4,
			selected: null,
			claims: [
				{ passageId: 'p1', state: 'dismissed', excerptStart: null, excerptEnd: null },
				{ passageId: 'p2', state: 'suggested', excerptStart: 0, excerptEnd: 19 },
				{ passageId: 'p2', state: 'confirmed', excerptStart: 0, excerptEnd: 19 }
			]
		});
		const [, p1, p2] = paper.passages;
		expect(p1!.highlight).toBe('none');
		expect(p2!.highlight).toBe('confirmed');
		expect(p2!.number).toBe(2);
		expect(p2!.segments.map((segment) => segment.marked)).toEqual([true, false]);
		expect(inlineText(p2!.segments[0]!.nodes)).toBe('A member may leave.');
		expect(words(p2!.segments)).toBe('A member may leave. They give sixty days notice.');
	});
});

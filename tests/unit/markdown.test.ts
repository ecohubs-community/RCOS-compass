import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	isSafeHref,
	parseMarkdown,
	plainText,
	type BlockNode,
	type InlineNode
} from '../../src/lib/server/markdown.js';

/**
 * docs/06-testing-strategy.md §6.6, in the phase that introduces the risk.
 *
 * Every phase before this rendered strings the application wrote. This one
 * renders text members wrote — a definition body, a discussion post, a proposal
 * — and the person who writes the Membership Agreement is not necessarily the
 * person it is about.
 *
 * The defence is structural rather than a filter: parsing produces a narrow node
 * tree, and a Svelte component renders it with ordinary templating. There is no
 * HTML string, so there is nothing for a payload to be smuggled through. These
 * tests check that the tree really is narrow.
 */

/** The payloads §6.6 names, plus the ones that catch a lazy scheme check. */
const PAYLOADS = [
	'<img src=x onerror="alert(1)">',
	'<script>alert(1)</script>',
	'<a href="javascript:alert(1)">click</a>',
	'[click](javascript:alert(1))',
	'[click](JaVaScRiPt:alert(1))',
	'[click](java\tscript:alert(1))',
	'![boom](javascript:alert(1))',
	'![boom](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
	'<iframe src="https://evil.example"></iframe>',
	'<div onmouseover="alert(1)">hover</div>',
	'[click](vbscript:msgbox(1))',
	'[click](//evil.example/steal)'
];

/** Every string that ends up in the rendered tree. */
function texts(source: string): string[] {
	const out: string[] = [];

	const walkInline = (nodes: InlineNode[]) => {
		for (const node of nodes) {
			if (node.type === 'text' || node.type === 'code') out.push(node.value);
			else if (node.type !== 'break') walkInline(node.children);
		}
	};

	const walk = (nodes: BlockNode[]) => {
		for (const node of nodes) {
			if (node.type === 'paragraph' || node.type === 'heading') walkInline(node.children);
			else if (node.type === 'list') node.items.forEach(walk);
			else if (node.type === 'quote') walk(node.children);
			else if (node.type === 'code') out.push(node.value);
		}
	};

	walk(parseMarkdown(source));
	return out;
}

/** Every href that survives into the tree. */
function hrefs(source: string): string[] {
	const out: string[] = [];

	const walkInline = (nodes: InlineNode[]) => {
		for (const node of nodes) {
			if (node.type === 'link') {
				out.push(node.href);
				walkInline(node.children);
			} else if (node.type === 'strong' || node.type === 'em') {
				walkInline(node.children);
			}
		}
	};

	const walk = (nodes: BlockNode[]) => {
		for (const node of nodes) {
			if (node.type === 'paragraph' || node.type === 'heading') walkInline(node.children);
			else if (node.type === 'list') node.items.forEach(walk);
			else if (node.type === 'quote') walk(node.children);
		}
	};

	walk(parseMarkdown(source));
	return out;
}

describe('a payload never becomes a node', () => {
	it.each(PAYLOADS)('%s', (payload) => {
		const blocks = parseMarkdown(`Members may leave at any time. ${payload}`);
		const json = JSON.stringify(blocks);

		// Only these node types exist. There is no 'html', no 'image', no 'raw'.
		const types = [...json.matchAll(/"type":"(\w+)"/g)].map((m) => m[1]!);
		for (const type of types) {
			expect(
				[
					'paragraph',
					'heading',
					'list',
					'quote',
					'code',
					'rule',
					'text',
					'strong',
					'em',
					'link',
					'break'
				],
				`unexpected node type "${type}" for ${payload}`
			).toContain(type);
		}

		// No href survives that a browser would execute.
		for (const href of hrefs(`${payload}`)) {
			expect(isSafeHref(href), `${href} survived`).toBe(true);
			expect(href.toLowerCase()).not.toMatch(/javascript|vbscript|^data:/);
		}
	});

	it('keeps the words even when it drops the construct', () => {
		// A member's text vanishing is its own kind of bug: they would rewrite it,
		// and wonder why the app ate the first attempt.
		const blocks = parseMarkdown('[our exit rule](javascript:alert(1)) applies to everyone.');
		expect(texts('[our exit rule](javascript:alert(1)) applies to everyone.').join('')).toContain(
			'our exit rule'
		);
		expect(hrefs('[our exit rule](javascript:alert(1))')).toEqual([]);
		expect(blocks.length).toBeGreaterThan(0);
	});

	it('leaves an ordinary link alone', () => {
		expect(hrefs('[the charter](https://valle-verde.example/charter)')).toEqual([
			'https://valle-verde.example/charter'
		]);
		expect(hrefs('[email us](mailto:hello@example.org)')).toEqual(['mailto:hello@example.org']);
		expect(hrefs('[the register](/c/valle-verde/decisions)')).toEqual(['/c/valle-verde/decisions']);
	});
});

describe('which destinations are allowed', () => {
	it.each([
		'https://example.org',
		'http://example.org',
		'mailto:ana@example.org',
		'/c/valle-verde',
		'../decisions'
	])('allows %s', (href) => {
		expect(isSafeHref(href)).toBe(true);
	});

	it.each([
		'javascript:alert(1)',
		'JAVASCRIPT:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'vbscript:msgbox(1)',
		'file:///etc/passwd',
		'//evil.example/steal'
	])('refuses %s', (href) => {
		expect(isSafeHref(href)).toBe(false);
	});
});

describe('the subset governance text needs', () => {
	it('renders paragraphs, emphasis, lists and quotes', () => {
		const blocks = parseMarkdown(
			['A member **may** leave.', '', '- with notice', '- or without', '', '> As agreed.'].join(
				'\n'
			)
		);
		expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list', 'quote']);
	});

	it('never emits an h1, because the page already has one', () => {
		const blocks = parseMarkdown('# Exit\n\n## Notice');
		const levels = blocks.filter((b) => b.type === 'heading').map((b) => b.level);
		expect(Math.min(...levels)).toBeGreaterThanOrEqual(2);
	});

	it('gives plain text for search and digests', () => {
		expect(plainText('A member **may** leave.\n\n- with notice')).toBe(
			'A member may leave. with notice'
		);
		expect(plainText('')).toBe('');
	});
});

describe('nothing renders external text as raw HTML', () => {
	const root = join(import.meta.dirname, '../..');

	function svelteFiles(dir: string): string[] {
		return readdirSync(dir).flatMap((entry) => {
			const path = join(dir, entry);
			return statSync(path).isDirectory()
				? svelteFiles(path)
				: path.endsWith('.svelte')
					? [path]
					: [];
		});
	}

	it('there are components to check', () => {
		expect(svelteFiles(join(root, 'src')).length).toBeGreaterThan(0);
	});

	it('no component uses {@html} at all', () => {
		// The blunt form of §6.6's grep test, and the honest one: this codebase
		// has no case for raw HTML, so the rule is "none" rather than "none with
		// untrusted input", which would need a judgement at every call site.
		const offenders = svelteFiles(join(root, 'src'))
			.filter((file) => {
				// Comments are stripped first: a comment explaining why this codebase
				// does not use raw HTML would otherwise be reported as using it, and
				// the first version of this test did exactly that.
				const source = readFileSync(file, 'utf8')
					.replace(/<!--[\s\S]*?-->/g, '')
					.replace(/\/\*[\s\S]*?\*\//g, '')
					.replace(/\/\/[^\n]*/g, '');
				return /\{@html\b/.test(source);
			})
			.map((file) => relative(root, file));

		expect(offenders, 'render text through templating; the parser gives a node tree').toEqual([]);
	});
});

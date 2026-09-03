import { marked, type Token, type Tokens } from 'marked';
import type { BlockNode, InlineNode } from '../shared/markdown.js';

export type { BlockNode, InlineNode };

/**
 * Turning what a member wrote into something safe to render.
 *
 * The approach matters more than the parser. **This never produces an HTML
 * string.** It produces a narrow tree of nodes that a Svelte component renders
 * with ordinary templating, so every piece of text goes through Svelte's own
 * escaping and there is no `{@html}` anywhere for a payload to reach.
 *
 * That is stronger than sanitising. A sanitiser is a denylist argument — "we
 * removed the dangerous things" — and is only as good as its list. This is an
 * allowlist by construction: the node types below are the only ones that exist,
 * and anything marked produces that is not one of them becomes text. A new
 * Markdown feature, an HTML block, a `javascript:` URL, an `onerror` attribute —
 * none of them have anywhere to go.
 *
 * The subset is what governance text actually needs (docs/11 talks about
 * subjects, processes and consequences, not about typography): paragraphs,
 * headings, emphasis, lists, quotes, code, and links to somewhere a person can
 * actually go.
 */

/** Schemes a link may use. Everything else renders as plain text. */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

/**
 * Is this somewhere a person can go?
 *
 * Parsed rather than pattern-matched: `javascript:alert(1)` and its many
 * encodings are all one thing to `URL`, and a regex over schemes is a game of
 * whack-a-mole against a parser that has already been written correctly.
 * A relative link resolves against a base that is thrown away, so `/c/x` and
 * `../y` are allowed and `//evil.example` is not.
 */
export function isSafeHref(href: string): boolean {
	try {
		const url = new URL(href, 'https://compass.invalid/');
		if (!SAFE_SCHEMES.includes(url.protocol)) return false;
		// A protocol-relative URL inherits the scheme but not the host we intended.
		if (/^\s*\/\//.test(href)) return false;
		return true;
	} catch {
		return false;
	}
}

function inline(tokens: Token[] | undefined): InlineNode[] {
	const out: InlineNode[] = [];
	for (const token of tokens ?? []) {
		switch (token.type) {
			case 'text': {
				const t = token as Tokens.Text;
				// `text` tokens can themselves carry children when they contain
				// emphasis; marked gives both shapes.
				if (t.tokens?.length) out.push(...inline(t.tokens));
				else out.push({ type: 'text', value: t.text });
				break;
			}
			case 'escape':
				out.push({ type: 'text', value: (token as Tokens.Escape).text });
				break;
			case 'strong':
				out.push({ type: 'strong', children: inline((token as Tokens.Strong).tokens) });
				break;
			case 'em':
				out.push({ type: 'em', children: inline((token as Tokens.Em).tokens) });
				break;
			case 'codespan':
				out.push({ type: 'code', value: (token as Tokens.Codespan).text });
				break;
			case 'br':
				out.push({ type: 'break' });
				break;
			case 'link': {
				const link = token as Tokens.Link;
				const children = inline(link.tokens);
				// A link nobody should follow does not take its words with it — the
				// text a member wrote stays readable. Only the destination goes.
				if (isSafeHref(link.href)) out.push({ type: 'link', href: link.href, children });
				else out.push(...children);
				break;
			}
			default:
				// Images, raw HTML, footnotes, anything a future marked adds: the
				// text is kept and the construct is not.
				if ('text' in token && typeof token.text === 'string') {
					out.push({ type: 'text', value: token.text });
				}
				break;
		}
	}
	return out;
}

function block(tokens: Token[]): BlockNode[] {
	const out: BlockNode[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case 'paragraph':
				out.push({ type: 'paragraph', children: inline((token as Tokens.Paragraph).tokens) });
				break;
			case 'heading': {
				const heading = token as Tokens.Heading;
				// A definition lives inside a page that already has an h1; its own
				// headings start below it, whatever the author typed.
				const level = Math.min(4, Math.max(2, heading.depth + 1)) as 2 | 3 | 4;
				out.push({ type: 'heading', level, children: inline(heading.tokens) });
				break;
			}
			case 'list': {
				const list = token as Tokens.List;
				out.push({
					type: 'list',
					ordered: list.ordered,
					items: list.items.map((item) => block(item.tokens ?? []))
				});
				break;
			}
			case 'blockquote':
				out.push({ type: 'quote', children: block((token as Tokens.Blockquote).tokens ?? []) });
				break;
			case 'code':
				out.push({ type: 'code', value: (token as Tokens.Code).text });
				break;
			case 'hr':
				out.push({ type: 'rule' });
				break;
			case 'space':
				break;
			default: {
				// Tables, HTML blocks, anything unknown: kept as words, dropped as
				// structure. Never silently discarded — a member's text disappearing
				// is its own kind of bug.
				const text = 'raw' in token ? String(token.raw).trim() : '';
				if (text) out.push({ type: 'paragraph', children: [{ type: 'text', value: text }] });
				break;
			}
		}
	}
	return out;
}

/** Parse governance text into the only shapes the renderer knows. */
export function parseMarkdown(source: string): BlockNode[] {
	if (!source.trim()) return [];
	return block(marked.lexer(source));
}

/**
 * The words, with no structure at all — for search, for a digest subject line,
 * and for the places that must not carry formatting.
 */
export function plainText(source: string): string {
	const walk = (nodes: InlineNode[]): string =>
		nodes
			.map((node) => {
				if (node.type === 'text' || node.type === 'code') return node.value;
				if (node.type === 'break') return ' ';
				return walk(node.children);
			})
			.join('');

	const blocks = (nodes: BlockNode[]): string =>
		nodes
			.map((node) => {
				switch (node.type) {
					case 'paragraph':
					case 'heading':
						return walk(node.children);
					case 'list':
						return node.items.map((item) => blocks(item)).join(' ');
					case 'quote':
						return blocks(node.children);
					case 'code':
						return node.value;
					case 'rule':
						return '';
				}
			})
			.filter(Boolean)
			.join(' ');

	return blocks(parseMarkdown(source)).replace(/\s+/g, ' ').trim();
}

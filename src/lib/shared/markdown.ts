/**
 * The shapes governance text can take once it has been parsed.
 *
 * These live outside `$lib/server` because the renderer is a component and a
 * component may never import from the server (docs/02-component-guidelines.md
 * §4). The *parser* stays server-side — it is where the safety argument lives,
 * and there is no reason to ship a Markdown parser to the browser to render text
 * the server has already parsed.
 *
 * The union is the allowlist. A node type that is not here cannot be produced
 * and cannot be rendered, which is why an HTML block or a `javascript:` URL has
 * nowhere to go — see `$lib/server/markdown`.
 */
export type InlineNode =
	| { type: 'text'; value: string }
	| { type: 'strong'; children: InlineNode[] }
	| { type: 'em'; children: InlineNode[] }
	| { type: 'code'; value: string }
	| { type: 'link'; href: string; children: InlineNode[] }
	| { type: 'break' };

export type BlockNode =
	| { type: 'paragraph'; children: InlineNode[] }
	| { type: 'heading'; level: 2 | 3 | 4; children: InlineNode[] }
	| { type: 'list'; ordered: boolean; items: BlockNode[][] }
	| { type: 'quote'; children: BlockNode[] }
	| { type: 'code'; value: string }
	| { type: 'rule' };

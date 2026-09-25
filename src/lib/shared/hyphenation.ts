/**
 * The one rule for a word split with a hyphen at a line break.
 *
 * The extractor (`$lib/server/documents/extract.ts`) joins such a word back
 * together when it builds a paragraph, and the excerpt matcher (`./excerpt.ts`)
 * has to recognise the same join in words a member selected on the rendered
 * page, where the hyphen is still drawn. Two copies of the rule would drift, and
 * a drift shows up as a selection that silently maps whole. Here rather than on
 * the server because the matcher runs in the browser
 * (`docs/02-component-guidelines.md` §4).
 *
 * The join: text ending in a letter and a hyphen, followed by text starting with
 * a lowercase letter. "commit-" + "tee" is one word; "Valle-" + "Verde" is not.
 */
export function joinsAcrossHyphen(before: string, after: string): boolean {
	return /\p{L}-$/u.test(before) && /^\p{Ll}/u.test(after);
}

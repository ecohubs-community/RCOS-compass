import { joinsAcrossHyphen } from './hyphenation.js';

/**
 * Words a member selected inside one paragraph, in either view, before they are
 * matched to its text: `near` is roughly where in the passage text the selection
 * began, or null when that is not known.
 */
export type SelectedWords = { passageId: string; words: string; near: number | null };

/**
 * Where the words a member selected sit in a passage's stored text. The one
 * matcher for both views of a document (`pdf-selection-mapping`, design
 * decision 4); the excerpt range it returns is what `mapPassage` stores.
 *
 * The selection and the stored text say the same words differently:
 *
 * - **whitespace** — a line break rendered where the text has a space, a space
 *   the page shows between two runs the extractor joined, or none where it put
 *   one. So the comparison ignores whitespace entirely, and maps back to the
 *   stored text's own indices;
 * - **a word hyphenated across a line** — drawn with its hyphen, stored without
 *   it. A hyphen in the selection may be skipped wherever the extractor's own
 *   rule (`joinsAcrossHyphen`) would have joined there;
 * - **a phrase the paragraph says twice** — the member selected one of them.
 *   `near`, an approximate offset into the stored text of where the selection
 *   began, picks the occurrence closest to it.
 *
 * Returns null when the words are not in the text, or there are none: the
 * caller offers the paragraph whole rather than a guess.
 */
export function findExcerpt(
	text: string,
	words: string,
	near: number | null = null
): { start: number; end: number } | null {
	// The stored text without whitespace, and where each character came from.
	const chars: string[] = [];
	const at: number[] = [];
	for (let index = 0; index < text.length; index++) {
		if (!/\s/u.test(text[index]!)) {
			chars.push(text[index]!);
			at.push(index);
		}
	}
	// UTF-16 units on both sides, so the indices agree with `text`'s.
	const joined = words.replace(/\s+/gu, '');
	const wanted = joined.split('');
	if (wanted.length === 0) return null;

	/** The index in `chars` just past a match starting at `from`, or -1. */
	function matchFrom(from: number): number {
		let i = from;
		let j = 0;
		while (j < wanted.length) {
			if (i < chars.length && chars[i] === wanted[j]) {
				i++;
				j++;
			} else if (
				wanted[j] === '-' &&
				j > 0 &&
				joinsAcrossHyphen(joined.slice(0, j + 1), joined.slice(j + 1))
			) {
				j++;
			} else {
				return -1;
			}
		}
		return i;
	}

	let best: { start: number; end: number } | null = null;
	for (let from = 0; from < chars.length; from++) {
		if (chars[from] !== wanted[0]) continue;
		const past = matchFrom(from);
		if (past === -1) continue;
		const found = { start: at[from]!, end: at[past - 1]! + 1 };
		if (near === null) return found;
		if (!best || Math.abs(found.start - near) < Math.abs(best.start - near)) best = found;
	}
	return best;
}

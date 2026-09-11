/**
 * Splitting a body into the lines the linter judges.
 *
 * The guide's test is per line — *what breaks if we delete this line?* — and
 * that is a test you apply to a sentence. So a "line" here is a sentence within
 * a block, not a newline-delimited row: governance prose imported from a
 * community's own statutes arrives as paragraphs, and judging each paragraph as
 * one line would reproduce the whole-body bug with extra steps.
 *
 * `Intl.Segmenter` rather than a regex. It is in Node 24, needs no dependency,
 * and is locale-aware — which matters because Compass is multilingual and the
 * vagueness lists are already per-locale. A hand-rolled splitter gets "e.g.",
 * "§3.6", "3.5 months" and German "z.B." wrong in a different way per language.
 */

/**
 * Blocks: paragraphs, and list items.
 *
 * A list item is its own block even when it is not a full sentence, because a
 * numbered obligation is exactly the shape a rule takes and "(c) is removed from
 * the register" has to be judged on its own.
 */
function blocks(text: string): string[] {
	return text
		.split(/\n{2,}/)
		.flatMap((paragraph) => paragraph.split(/\n(?=\s*(?:[-*+•]|\(?[0-9a-z][).])\s)/i))
		.map((block) => block.trim())
		.filter((block) => block.length > 0);
}

/** The sentences of one body, in order, with their whitespace trimmed. */
export function segmentLines(text: string, locale = 'en'): string[] {
	// A locale the runtime does not know must not take the linter down with it:
	// the split is worth having in an approximate form, and `en` is the list the
	// rules were written against anyway.
	let segmenter: Intl.Segmenter;
	try {
		segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
	} catch {
		segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
	}

	return blocks(text).flatMap((block) =>
		[...segmenter.segment(block)]
			.map((piece) => piece.segment.trim())
			.filter((sentence) => sentence.length > 0)
	);
}

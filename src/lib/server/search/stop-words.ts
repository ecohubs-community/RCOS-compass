/**
 * Words that match everything and therefore rank nothing.
 *
 * A member types *"can we spend €800 on the water pump?"* — nine words, of
 * which three carry the question. Left in, the common six match most of the
 * register and drown the three that matter.
 *
 * English only, and deliberately short. A longer list starts removing words
 * that are common in ordinary English and load-bearing in governance text:
 * "may", "must", "shall" and "not" are exactly the words a community argues
 * about, and a stop list that swallowed them would make the search worse in
 * the cases that matter most.
 */
export const STOP_WORDS = new Set([
	'a',
	'about',
	'all',
	'am',
	'an',
	'and',
	'any',
	'are',
	'as',
	'at',
	'be',
	'been',
	'but',
	'by',
	'can',
	'could',
	'did',
	'do',
	'does',
	'for',
	'from',
	'had',
	'has',
	'have',
	'how',
	'i',
	'if',
	'in',
	'into',
	'is',
	'it',
	'its',
	'of',
	'on',
	'or',
	'our',
	'out',
	'over',
	's',
	'so',
	'some',
	'than',
	'that',
	'the',
	'their',
	'them',
	'then',
	'there',
	'these',
	'they',
	'this',
	'to',
	'up',
	'us',
	'was',
	'we',
	'were',
	'what',
	'when',
	'where',
	'which',
	'who',
	'why',
	'will',
	'with',
	'would',
	'you',
	'your'
]);

/**
 * The words worth looking for, from whatever a member typed.
 *
 * Punctuation and currency symbols go; digits stay, because "€800" and "500"
 * are the kind of thing somebody searches for. One-character tokens go, since
 * they match everywhere.
 */
export function termsOf(text: string): string[] {
	const words = text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word.length > 1 && !STOP_WORDS.has(word));

	return [...new Set(words)];
}

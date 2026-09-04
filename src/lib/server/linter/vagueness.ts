/**
 * Vagueness word lists, per language. docs/11-definition-linter.md §6.1.
 *
 * Authored, never machine-translated: vagueness is idiomatic, and a translated
 * list would flag the wrong words while missing the ones that actually cause
 * arguments. A language with no list yet runs every other rule and **says so**
 * — silently skipping would be worse than not running, because a community would
 * believe their definitions had been checked.
 */
export const VAGUE_WORDS: Record<string, readonly string[]> = {
	en: [
		'regularly',
		'as needed',
		'reasonable',
		'when appropriate',
		'in a timely manner',
		'as soon as possible',
		'sufficient',
		'adequate',
		'significant',
		'material',
		'the community will decide',
		'normally',
		'usually',
		'where possible',
		'best effort',
		'from time to time',
		'appropriate',
		'relevant',
		'substantial'
	]
};

export function hasVaguenessList(locale: string): boolean {
	return locale in VAGUE_WORDS;
}

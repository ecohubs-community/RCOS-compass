import { baseLocale, getLocale, locales } from '$lib/paraglide/runtime';

/**
 * Which strings are still English, said out loud.
 *
 * Paraglide falls back to the base locale for a message a locale does not
 * define, which is right — a blank is worse than an English word. What it does
 * not do is say so, and a silent fallback is how a half-translated interface
 * looks finished and stays half-translated for a year. Nobody files a bug about
 * a screen that looks fine.
 *
 * So a message with no translation in the reader's locale is rendered through
 * `Untranslated`, which shows the English with a quiet marker. It is a to-do
 * list that maintains itself: the gaps are visible to the people who would
 * notice them, in the places they actually appear.
 */

/**
 * Message keys each locale actually defines — read from the source files, not
 * from the compiled output.
 *
 * Paraglide fills a missing translation in at compile time, so every locale's
 * generated module exports every key and asking the runtime "does German have
 * this" always answers yes. Comparing rendered strings instead would call
 * "Standard" untranslated in German, where it is simply the same word. The
 * message files are the only place the question has a truthful answer.
 */
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const SOURCES: Record<string, Record<string, unknown>> = { en, de, es };

function keysFor(locale: string): Set<string> {
	const cached = defined.get(locale);
	if (cached) return cached;

	const keys = new Set(Object.keys(SOURCES[locale] ?? {}).filter((key) => !key.startsWith('$')));
	defined.set(locale, keys);
	return keys;
}

const defined = new Map<string, Set<string>>();

/** True when this message would render the base locale's text as a fallback. */
export function isUntranslated(key: string, locale: string = getLocale()): boolean {
	if (locale === baseLocale) return false;
	return !keysFor(locale).has(key);
}

/** Every locale the interface has messages for. The standard has more. */
export { locales, baseLocale };

/**
 * How complete each locale is, for the settings screen and for the test that
 * stops a locale being added and then quietly forgotten.
 */
export function translationCoverage(): { locale: string; translated: number; total: number }[] {
	const total = keysFor(baseLocale).size;
	return locales.map((locale) => ({
		locale,
		translated: keysFor(locale).size,
		total
	}));
}

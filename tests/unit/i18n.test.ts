import { describe, expect, it } from 'vitest';
import { baseLocale, isUntranslated, locales, translationCoverage } from '../../src/lib/i18n.js';
import * as m from '../../src/lib/paraglide/messages.js';

/**
 * The interface's languages, and whether the gaps are visible.
 *
 * The property worth testing is not "German exists" — it is that a string with
 * no German is *reported* as having none. A silent fallback is how a
 * half-translated interface looks finished: nobody files a bug about a screen
 * that reads fine, so the untranslated half never gets translated.
 */
describe('the interface has languages', () => {
	it('ships the three the roadmap committed to', () => {
		expect([...locales].sort()).toEqual(['de', 'en', 'es']);
		expect(baseLocale).toBe('en');
	});

	it('has every message in the base locale', () => {
		// The base locale is the one that must be complete, because it is what
		// every fallback renders.
		const coverage = translationCoverage().find((row) => row.locale === baseLocale)!;
		expect(coverage.translated).toBe(coverage.total);
		expect(coverage.total).toBeGreaterThan(0);
	});
});

describe('an untranslated string says so', () => {
	it('reports a message the locale does not define', () => {
		// `nav_ai_settings` and `nav_path_settings` are English-only for now, which
		// is a fact about the work rather than a mistake — and the point is that a
		// German reader can see it rather than assuming Compass has no German.
		expect(isUntranslated('nav_ai_settings', 'de')).toBe(true);
	});

	it('reports nothing for a message the locale does define', () => {
		expect(isUntranslated('nav_dashboard', 'de')).toBe(false);
		expect(isUntranslated('nav_dashboard', 'es')).toBe(false);
	});

	it('never reports the base locale as untranslated', () => {
		for (const key of Object.keys(m)) {
			expect(isUntranslated(key, baseLocale), key).toBe(false);
		}
	});

	it('is not fooled by a word that is the same in two languages', () => {
		// Read from the message files rather than by comparing rendered strings:
		// "Standard" is "Standard" in German, and a comparison would call a real
		// translation a gap — which is the kind of false positive that gets a
		// mechanism switched off.
		expect(isUntranslated('nav_standard', 'de')).toBe(false);
	});

	it('counts what is left to do, per language', () => {
		const coverage = translationCoverage();
		expect(coverage).toHaveLength(locales.length);
		for (const row of coverage) {
			expect(row.translated).toBeLessThanOrEqual(row.total);
			// A locale that is listed and has nothing is worse than not listing it:
			// it promises a language the product does not speak.
			expect(row.translated).toBeGreaterThan(0);
		}
	});
});

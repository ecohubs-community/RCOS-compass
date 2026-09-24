import { describe, expect, it } from 'vitest';
import { negotiateLocale } from '../../src/lib/server/locale.js';

/**
 * The sign-in screens' language, from `Accept-Language`. The only place the
 * browser is asked; everywhere else a community decides.
 */
describe('choosing a sign-in language from the browser', () => {
	it('takes the first language the interface has', () => {
		expect(negotiateLocale('de')).toBe('de');
		expect(negotiateLocale('fr, es;q=0.8, en;q=0.5')).toBe('es');
	});

	it('reads a regional tag as its language', () => {
		expect(negotiateLocale('de-AT,de;q=0.9')).toBe('de');
		expect(negotiateLocale('es-EC')).toBe('es');
		expect(negotiateLocale('EN-gb')).toBe('en');
	});

	it('honours weights over order, and order between equal weights', () => {
		expect(negotiateLocale('en;q=0.4, de;q=0.9')).toBe('de');
		expect(negotiateLocale('es, de')).toBe('es');
	});

	it('treats q=0 as "not this", and * as no preference at all', () => {
		expect(negotiateLocale('de;q=0, es;q=0.1')).toBe('es');
		expect(negotiateLocale('*')).toBeNull();
	});

	it('answers nothing when nothing matches, so the default wins', () => {
		expect(negotiateLocale('fr-FR, ja')).toBeNull();
		expect(negotiateLocale('')).toBeNull();
		expect(negotiateLocale(null)).toBeNull();
		expect(negotiateLocale('de;q=banana')).toBeNull();
	});
});

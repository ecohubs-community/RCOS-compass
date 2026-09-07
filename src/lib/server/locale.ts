import { AsyncLocalStorage } from 'node:async_hooks';
import {
	assertIsLocale,
	baseLocale,
	isLocale,
	locales,
	overwriteServerAsyncLocalStorage,
	type Locale
} from '$lib/paraglide/runtime';

/**
 * Which language this request is answered in. UI spec §1.6, `docs/09` §i18n.
 *
 * The locale is a column on `community`, not a cookie, a header or a URL
 * segment. A community picks one and everybody working in it sees the same
 * interface — governance is a shared activity, and two members reading the same
 * rule in two languages is how a disagreement becomes a translation argument.
 *
 * That makes the locale a per-request value that is only known after the tenant
 * has been resolved, so it lives in `AsyncLocalStorage` rather than a module
 * variable: concurrent requests for two communities must not see each other's
 * language, and a module variable under `await` is exactly that bug.
 *
 * Paraglide's `custom-server` strategy reads from the store this installs.
 */
// Paraglide's own store type has every field optional, so the storage is typed
// to match it exactly rather than more tightly — a narrower type here is not
// assignable to the parameter and the compiler is right about that.
const storage = new AsyncLocalStorage<{
	locale?: Locale;
	origin?: string;
	messageCalls?: Set<string>;
}>();
overwriteServerAsyncLocalStorage(storage);

export { locales, baseLocale };

/**
 * The community's locale if it is one we have messages for, else the default.
 *
 * A community whose locale is `fr` gets the standard's French — the vendored
 * data has all five — and an English interface, because the interface has three.
 * That is a fallback the reader can see (`untranslated()`), not a silent one.
 */
export function localeOf(value: string | null | undefined): Locale {
	return value && isLocale(value) ? assertIsLocale(value) : baseLocale;
}

/** Run the rest of a request with its language decided. */
export function withLocale<T>(locale: string, origin: string, run: () => T): T {
	return storage.run({ locale: localeOf(locale), origin }, run);
}

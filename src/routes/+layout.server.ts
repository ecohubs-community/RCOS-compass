import { getLocale } from '$lib/paraglide/runtime';
import type { LayoutServerLoad } from './$types';

/**
 * The language this page was rendered in, handed to the client.
 *
 * The server knows it — `hooks.server.ts` puts the community's locale in async
 * local storage and every message function reads it from there. The browser
 * does not: async local storage has no client half, so after hydration
 * `getLocale()` fell back to `baseLocale` and Svelte re-rendered a German page
 * in English, in place, a few hundred milliseconds after it arrived.
 *
 * Passing it as data rather than reading a cookie or a header keeps one rule:
 * the locale is a property of the community whose page this is, not a
 * preference of the browser looking at it.
 */
export const load: LayoutServerLoad = () => ({ locale: getLocale() });

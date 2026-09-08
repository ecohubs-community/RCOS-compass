import { browser } from '$app/environment';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import type { LayoutLoad } from './$types';

/**
 * Tell the client half of Paraglide which language the server chose.
 *
 * Only in the browser. `overwriteGetLocale` replaces a module-level binding, so
 * doing it on the server would make one request's community the language of
 * every request handled by that process afterwards — the exact bug async local
 * storage is there to prevent.
 *
 * A universal load runs before the layout renders, so the locale is in place
 * for the first client-side render rather than one frame after it.
 */
export const load: LayoutLoad = ({ data }) => {
	if (browser) overwriteGetLocale(() => data.locale);
	return data;
};

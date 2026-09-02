import { error } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';

/**
 * The gallery is a development and review surface; it never ships.
 *
 * Guarded on validated runtime configuration rather than on `dev` from
 * `$app/environment`. `dev` is a build-time constant, and the bundler tree-shook
 * the guard out entirely — the compiled route was `function load() {}`, so the
 * page was served by production builds despite the check. A runtime check cannot
 * be optimised away, and it is the same mechanism the `__test` routes use.
 */
export function load() {
	if (getConfig().isProduction) error(404, 'Not found');
}

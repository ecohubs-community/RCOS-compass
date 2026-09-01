import { error } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';

/**
 * Routes that exist only so the error and header contracts can be asserted
 * against a real production build. Gated on ALLOW_TEST_ROUTES, which defaults to
 * off; `tests/unit/config.test.ts` asserts that default.
 */
export function load() {
	if (!getConfig().allowTestRoutes) error(404, 'Not found');
}

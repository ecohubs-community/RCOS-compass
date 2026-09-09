import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The console has no page of its own — its first screen is the tenant list.
 *
 * `/admin` is the address people type and the one docs/05-admin-console.md §5
 * names alongside the others, so it answers rather than 404s. The guard has
 * already run twice before this load (hooks, then the layout), so a non-admin
 * still gets the 404 and never learns that this redirect exists.
 *
 * 307, not 308: the landing screen may change, and a browser caches a 308
 * forever.
 */
export const load: PageServerLoad = () => {
	redirect(307, '/admin/communities');
};

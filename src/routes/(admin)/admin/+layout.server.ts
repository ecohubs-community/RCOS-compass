import { requirePlatformAdmin } from '$lib/server/auth/admin';
import type { LayoutServerLoad } from './$types';

/** The second of three checks; see requirePlatformAdmin. */
export const load: LayoutServerLoad = ({ locals, url }) => {
	requirePlatformAdmin(locals.user, url.pathname);
	return { adminEmail: locals.user!.email };
};

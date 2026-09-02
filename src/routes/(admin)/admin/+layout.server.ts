import { requirePlatformAdmin } from '$lib/server/auth/admin';
import type { LayoutServerLoad } from './$types';

/** The second of three checks; see requirePlatformAdmin. */
export const load: LayoutServerLoad = ({ locals }) => {
	requirePlatformAdmin(locals.user);
	return { adminEmail: locals.user!.email };
};

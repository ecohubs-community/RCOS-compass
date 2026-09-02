import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { listTenants } from '$lib/server/services/admin/communities';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	// The third check. Layout guards are easy to remove by accident.
	requirePlatformAdmin(locals.user);
	return { tenants: listTenants() };
};

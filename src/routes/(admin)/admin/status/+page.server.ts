import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { getDb } from '$lib/server/db';
import { instanceStatus } from '$lib/server/services/admin/status';
import type { PageServerLoad } from './$types';

/** docs/05-admin-console.md §3.5 — the page that answers "is anything broken". */
export const load: PageServerLoad = ({ locals }) => {
	requirePlatformAdmin(locals.user);
	return { status: instanceStatus(getDb()) };
};

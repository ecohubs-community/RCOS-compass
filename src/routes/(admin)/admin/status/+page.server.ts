import { requirePlatformAdmin } from '#lib/server/auth/admin.ts';
import { getDb } from '#lib/server/db/index.ts';
import { instanceStatus } from '#lib/server/services/admin/status.ts';
import type { PageServerLoad } from './$types';

/** docs/05-admin-console.md §3.5 — the page that answers "is anything broken". */
export const load: PageServerLoad = ({ locals }) => {
	requirePlatformAdmin(locals.user);
	return { status: instanceStatus(getDb()) };
};

import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { getDb } from '$lib/server/db';
import { auditActionsSeen, listPlatformAudit } from '$lib/server/services/admin/audit';
import { listTenants } from '$lib/server/services/admin/communities';
import type { PageServerLoad } from './$types';

/**
 * The platform audit log. docs/05-admin-console.md §3.4.
 *
 * Read-only, including for admins — there is no action on this page, and none
 * beneath it: the service layer has no update or delete for an audit event.
 */
export const load: PageServerLoad = ({ locals, url }) => {
	requirePlatformAdmin(locals.user);

	const filters = {
		action: url.searchParams.get('action') ?? undefined,
		communityId: url.searchParams.get('community') ?? undefined,
		actor: url.searchParams.get('actor') ?? undefined
	};

	return {
		filters,
		events: listPlatformAudit({ ...filters, limit: 200 }, getDb()),
		actions: auditActionsSeen(getDb()),
		tenants: listTenants(getDb()).map((t) => ({ id: t.id, name: t.name }))
	};
};

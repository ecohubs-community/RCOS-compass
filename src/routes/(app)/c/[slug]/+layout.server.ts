import { error } from '@sveltejs/kit';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { resolveCommunity } from '$lib/server/services/tenancy';
import { requirePermission, type Ctx } from '$lib/server/auth/guard';
import type { LayoutServerLoad } from './$types';

/**
 * Tenant resolution. docs/04-security.md §2.
 *
 * Everything under this layout is scoped to one community, resolved from the URL
 * slug and never from the session. A community the user is not a member of is
 * reported exactly as one that does not exist — telling a stranger that a
 * community exists is itself a disclosure.
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
	const resolution = resolveCommunity(getDb(), params.slug, locals.user?.id ?? null);

	if (resolution.kind === 'not_found') error(404, 'Not found');

	locals.community = resolution.community;
	locals.membership = resolution.membership;

	const ctx: Ctx = {
		user: locals.user!,
		community: resolution.community,
		membership: resolution.membership,
		now: systemClock.now
	};
	requirePermission(ctx, 'community.read');

	locals.log = locals.log.child({ communityId: resolution.community.id });

	return {
		community: {
			id: resolution.community.id,
			slug: resolution.community.slug,
			name: resolution.community.name,
			locale: resolution.community.locale,
			timezone: resolution.community.timezone
		},
		membership: {
			role: resolution.membership.role,
			isOwner: resolution.membership.isOwner
		},
		readOnly: resolution.kind === 'read_only' ? resolution.reason : null
	};
};

import { getDb } from '$lib/server/db';
import {
	activeStandardView,
	incompleteMandatoryArtifacts
} from '$lib/server/services/completeness';
import { unreadCount } from '$lib/server/services/notifications';
import { READINESS_DEPENDS, readiness } from '$lib/server/services/readiness';
import { requirePermission } from '$lib/server/auth/guard';
import { timeZoneFor } from '$lib/time/zone';
import type { LayoutServerLoad } from './$types';

/**
 * What the shell needs. docs/04-security.md §2.
 *
 * The community itself is resolved in the pipeline
 * (`$lib/server/http/resolve-tenant`), not here: SvelteKit runs actions before
 * loads, so a layout that resolved it would leave every form action without one.
 * This load reads what the pipeline established and re-checks the permission,
 * because a guard that exists in one place is a guard someone deletes.
 */
export const load: LayoutServerLoad = ({ locals, depends }) => {
	const ctx = locals.ctx!;
	requirePermission(ctx, 'community.read');

	// Every panel below shows a number from the same rows, so they refresh
	// together: a freeze invalidates this key and the whole shell reloads.
	depends(READINESS_DEPENDS);

	const figures = readiness(ctx);
	const standard = activeStandardView(getDb(), ctx);
	const mandatory = standard ? standard.view.mandatoryArtifacts().length : 0;

	return {
		/**
		 * The standard's own licence line, from its metadata rather than a string
		 * in a component. `docs/00` §12a asked for this in P1 and nothing ever
		 * printed it; a standard published under different terms now carries its
		 * own terms wherever its words appear.
		 */
		standardLicence: standard && {
			id: standard.row.standardId,
			version: standard.row.version,
			licence: standard.view.meta.licence,
			attribution: standard.view.meta.attribution
		},
		readiness: figures && {
			percent: figures.percent,
			satisfied: figures.satisfied,
			countable: figures.countable,
			layers: figures.layers
		},
		artifacts: {
			complete: mandatory - (standard ? incompleteMandatoryArtifacts(ctx).length : 0),
			total: mandatory
		},
		unread: unreadCount(ctx),
		/** The member's own zone, else the community's; calendar dates use the community's. */
		timeZone: timeZoneFor(ctx.user, ctx.community),
		communityTimeZone: timeZoneFor(null, ctx.community),
		community: {
			id: ctx.community.id,
			slug: ctx.community.slug,
			name: ctx.community.name,
			locale: ctx.community.locale,
			timezone: ctx.community.timezone
		},
		membership: {
			role: ctx.membership.role,
			isOwner: ctx.membership.isOwner,
			/**
			 * What to call the reader in the sidebar's own footer. The community
			 * name wins over the account name where one is set, because that is the
			 * name the rest of this community sees against everything they wrote.
			 */
			name: ctx.membership.displayName ?? ctx.user.name,
			seq: ctx.membership.seq
		},
		readOnly: locals.readOnly ?? null
	};
};

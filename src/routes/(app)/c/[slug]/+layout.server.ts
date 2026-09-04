import { error, redirect } from '@sveltejs/kit';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { resolveCommunity, resolveSlugRedirect } from '$lib/server/services/tenancy';
import { READINESS_DEPENDS, readiness } from '$lib/server/services/readiness';
import {
	activeStandardView,
	incompleteMandatoryArtifacts
} from '$lib/server/services/completeness';
import { unreadCount } from '$lib/server/services/notifications';
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
export const load: LayoutServerLoad = async ({ params, locals, url, depends }) => {
	// Every panel below this shows a number derived from the same rows, so they
	// refresh together: a freeze calls `invalidate(READINESS_DEPENDS)` and the
	// dashboard, the artifact list and the standard browser all reload. Declaring
	// it here rather than in each page means a new screen inherits it.
	depends(READINESS_DEPENDS);

	const resolution = resolveCommunity(getDb(), params.slug, locals.user?.id ?? null);

	if (resolution.kind === 'not_found') {
		// A slug the community used to answer to still resolves, for ninety days
		// after a rename (docs/05-admin-console.md §3.3): a decision reference
		// pasted into a mailing list last year should not become a dead link
		// because a community changed its name.
		//
		// Consulted only after `not_found`, so a live slug is never shadowed by a
		// redirect — and the redirect is offered only to someone who would be let
		// into the community it points at. `not_found` covers both "no such
		// community" and "not a member", so redirecting on it alone would tell a
		// stranger that the old slug existed and what it became, which is the one
		// thing the tenant boundary exists to withhold.
		const current = resolveSlugRedirect(getDb(), params.slug, systemClock.now());
		const target = current
			? resolveCommunity(getDb(), current, locals.user?.id ?? null)
			: { kind: 'not_found' as const };
		if (current && target.kind !== 'not_found') {
			// 308 rather than 301: it keeps the method, so a form post to an old
			// address is not silently turned into a GET.
			redirect(308, `${url.pathname.replace(`/c/${params.slug}`, `/c/${current}`)}${url.search}`);
		}
		error(404, 'Not found');
	}

	locals.community = resolution.community;
	locals.membership = resolution.membership;

	const ctx: Ctx = {
		user: locals.user!,
		community: resolution.community,
		membership: resolution.membership,
		now: systemClock.now
	};
	requirePermission(ctx, 'community.read');
	locals.ctx = ctx;

	locals.log = locals.log.child({ communityId: resolution.community.id });

	const figures = readiness(ctx);

	return {
		readiness: figures && {
			percent: figures.percent,
			satisfied: figures.satisfied,
			countable: figures.countable,
			layers: figures.layers
		},
		artifacts: (() => {
			const view = activeStandardView(getDb(), ctx);
			if (!view) return { complete: 0, total: 0 };
			const mandatory = view.view.mandatoryArtifacts();
			const incomplete = incompleteMandatoryArtifacts(ctx).length;
			return { complete: mandatory.length - incomplete, total: mandatory.length };
		})(),
		unread: unreadCount(ctx),
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

import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { community } from '$lib/server/db/schema/tenancy';
import type { LayoutServerLoad } from './$types';

/**
 * The public surface. UI spec §1.6, RCOS Appendix C.6.
 *
 * The first route group in the product with no `Ctx` — no session, no
 * membership, no permission to check. **It must never construct one.** A `Ctx`
 * with a placeholder user satisfies `requirePermission(ctx, 'community.read')`,
 * which would hand an anonymous visitor every read path there is. Everything
 * under here passes an `Audience` instead, and the type makes the shortcut
 * unavailable rather than merely discouraged.
 *
 * Two gates, both checked here. The community must have public pages switched
 * on, and the subject must be world-visible — the second is enforced by the
 * filter inside every read. With the switch off there is no public surface at
 * all: every URL is 404, so a community can step back from the open web without
 * unpublishing eleven artifacts one at a time.
 */
export const load: LayoutServerLoad = ({ params }) => {
	const db = getDb();

	const found = db
		.select({
			id: community.id,
			slug: community.slug,
			name: community.name,
			locale: community.locale,
			namesPolicy: community.publishNamesPolicy,
			publicIndexEnabled: community.publicIndexEnabled
		})
		.from(community)
		.where(and(eq(community.slug, params.slug), eq(community.status, 'active')))
		.get();

	// A community that has not switched its public pages on is indistinguishable
	// from one that does not exist — the same answer a suspended or deleted one
	// gets, and for the same reason.
	// Both gates come out of the one row: existing-and-active and having public
	// pages switched on are the same lookup, and asking twice only invited them
	// to be read from two different moments.
	if (!found || !found.publicIndexEnabled) error(404, 'Not found');

	const { publicIndexEnabled: _gate, ...visible } = found;

	// The community only. Each page builds its own `anonymousIn(id)` server-side
	// rather than being handed an audience through `data`, which would serialise
	// it to the browser for no reason and invite somebody to pass it back.
	return { community: visible };
};

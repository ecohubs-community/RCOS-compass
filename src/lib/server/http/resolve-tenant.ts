import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requirePermission, type Ctx } from '../auth/guard.js';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { community } from '../db/schema/tenancy.js';
import { resolveCommunity, resolveSlugRedirect } from '../services/tenancy.js';

/**
 * Tenant resolution, in the pipeline. docs/01-server-client-contract.md §5.
 *
 * It lives here rather than in the tenant layout's `load` because **SvelteKit
 * runs actions before loads**: a layout that resolved the community would leave
 * every form action without one, which is exactly the bug the loop spec found —
 * posting a new discussion died on `locals.ctx` being undefined.
 *
 * Doing it in the pipeline also means the answer is the same for a page load, a
 * form action and any future endpoint, rather than three chances to get the
 * boundary wrong.
 */
const TENANT_PATH = /^\/c\/([^/]+)(\/|$)/;
const PUBLIC_PATH = /^\/p\/([^/]+)(\/|$)/;
const INVITATION_PATH = /^\/invitations\//;

/**
 * The language a request is answered in, when there is no member to ask.
 *
 * The public group has no `Ctx` and no membership, so `resolveTenant` never
 * runs for it — and the locale fell back to English on every public page, in a
 * phase whose whole point was that a community's public face speaks the
 * community's language. The lookup is by slug alone: whether the page is served
 * at all is the layout's decision, and answering an eventual 404 in German
 * costs one indexed read.
 */
export function publicLocale(event: RequestEvent, db: Db): string | null {
	const match = PUBLIC_PATH.exec(event.url.pathname);
	if (!match) return null;

	const row = db
		.select({ locale: community.locale })
		.from(community)
		.where(and(eq(community.slug, decodeURIComponent(match[1]!)), eq(community.status, 'active')))
		.get();
	return row?.locale ?? null;
}

/**
 * The language an invitation is read in.
 *
 * An invited person has no membership and no tenant, so neither of the first two
 * sources exists — and the very first screen of the product is the worst place
 * to fall back to English at. The slug comes from the `?c=` that
 * `mail/messages.ts` puts on every invitation link, which is a hint and not a
 * credential: it chooses a language and nothing else. What the page is allowed
 * to say is still decided by the token alone.
 */
export function invitationLocale(event: RequestEvent, db: Db): string | null {
	if (!INVITATION_PATH.test(event.url.pathname)) return null;

	const slug = event.url.searchParams.get('c');
	if (!slug) return null;

	const row = db
		.select({ locale: community.locale })
		.from(community)
		.where(and(eq(community.slug, slug), eq(community.status, 'active')))
		.get();
	return row?.locale ?? null;
}

export function resolveTenant(event: RequestEvent, db: Db, clock: Clock): void {
	const match = TENANT_PATH.exec(event.url.pathname);
	if (!match) return;

	const slug = decodeURIComponent(match[1]!);
	const resolution = resolveCommunity(db, slug, event.locals.user?.id ?? null);

	if (resolution.kind === 'not_found') {
		// A slug the community used to answer to still resolves, for ninety days
		// after a rename — but only for someone who would be let into the community
		// it points at. `not_found` covers both "no such community" and "not a
		// member", so redirecting on it alone would tell a stranger the old slug
		// existed and what it became.
		const current = resolveSlugRedirect(db, slug, clock.now());
		if (current) {
			const target = resolveCommunity(db, current, event.locals.user?.id ?? null);
			if (target.kind !== 'not_found') {
				// 308, so a form post to an old address is not turned into a GET.
				redirect(
					308,
					`${event.url.pathname.replace(`/c/${slug}`, `/c/${current}`)}${event.url.search}`
				);
			}
		}
		error(404, 'Not found');
	}

	event.locals.community = resolution.community;
	event.locals.membership = resolution.membership;
	event.locals.readOnly = resolution.kind === 'read_only' ? resolution.reason : null;

	const ctx: Ctx = {
		user: event.locals.user!,
		community: resolution.community,
		membership: resolution.membership,
		now: clock.now
	};
	requirePermission(ctx, 'community.read');
	event.locals.ctx = ctx;

	event.locals.log = event.locals.log.child({ communityId: resolution.community.id });
}

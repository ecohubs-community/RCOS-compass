import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import {
	community,
	communitySlugRedirect,
	membership,
	type Community,
	type Membership
} from '../db/schema/tenancy.js';

/**
 * Resolving a request to a community. docs/04-security.md §2.
 *
 * The single highest-severity risk in the product is one community reading
 * another's data, so three things hold here:
 *
 *  - the slug comes from the URL, never from the session;
 *  - membership is looked up per request, so removing a member or changing a
 *    role takes effect immediately rather than at their next sign-in;
 *  - a community the user does not belong to is reported exactly as one that
 *    does not exist, so the boundary discloses nothing.
 */

export type Resolution =
	| { kind: 'ok'; community: Community; membership: Membership }
	| { kind: 'read_only'; community: Community; membership: Membership; reason: string }
	/** Covers "no such community", "not a member", and "deleted" alike. */
	| { kind: 'not_found' };

export function resolveCommunity(db: Db, slug: string, userId: string | null): Resolution {
	const found = db.select().from(community).where(eq(community.slug, slug)).get();

	// A soft-deleted community is gone as far as anyone outside the admin console
	// is concerned.
	if (!found || found.status === 'deleted') return { kind: 'not_found' };

	if (!userId) return { kind: 'not_found' };

	const current = db
		.select()
		.from(membership)
		.where(
			and(
				eq(membership.communityId, found.id),
				eq(membership.userId, userId),
				// A membership that has ended keeps its record and loses its access.
				isNull(membership.endedAt)
			)
		)
		.get();

	// Deliberately the same answer as "no such community": telling a stranger that
	// a community exists is itself a disclosure.
	if (!current) return { kind: 'not_found' };

	if (found.status === 'suspended') {
		return {
			kind: 'read_only',
			community: found,
			membership: current,
			reason:
				found.suspendedReason ??
				'This community is suspended. You can still read and export everything.'
		};
	}

	return { kind: 'ok', community: found, membership: current };
}

/**
 * Slugs a community may not take: they would shadow an application route, and
 * a community that shadows `/admin` is a phishing surface.
 */
export const RESERVED_SLUGS = new Set([
	'account',
	'admin',
	'api',
	'auth',
	'c',
	'invitations',
	'dev',
	'favicon',
	'healthz',
	'new',
	'public',
	'settings',
	'reset-password',
	'sign-in',
	'sign-out',
	'sign-up',
	'signin',
	'signout',
	'signup',
	'static',
	'_app',
	'__test'
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugProblem = 'reserved' | 'malformed' | 'too_short' | 'too_long' | 'taken';

export function validateSlug(db: Db | null, slug: string): SlugProblem | null {
	if (RESERVED_SLUGS.has(slug)) return 'reserved';
	if (slug.length < 3) return 'too_short';
	if (slug.length > 40) return 'too_long';
	if (!SLUG_PATTERN.test(slug)) return 'malformed';
	if (db && db.select().from(community).where(eq(community.slug, slug)).get()) return 'taken';
	return null;
}

/**
 * The slug a retired one now points at, if it is still within its window.
 *
 * Consulted only after {@link resolveCommunity} has said `not_found`, so a live
 * slug is never shadowed by an expired redirect pointing elsewhere. Returns null
 * for an unknown slug, an expired redirect, or a community that has since been
 * deleted — all of which are the same 404 to the person asking.
 */
export function resolveSlugRedirect(db: Db, slug: string, now: number): string | null {
	const redirect = db
		.select({ communityId: communitySlugRedirect.communityId })
		.from(communitySlugRedirect)
		.where(
			and(
				eq(communitySlugRedirect.oldSlug, slug),
				gt(communitySlugRedirect.expiresAt, new Date(now))
			)
		)
		.get();
	if (!redirect) return null;

	const target = db
		.select({ slug: community.slug, status: community.status })
		.from(community)
		.where(eq(community.id, redirect.communityId))
		.get();
	if (!target || target.status === 'deleted') return null;
	// A redirect to itself would be a loop; it can only happen if a slug was
	// changed back to a retired name, which changeTenantSlug prevents.
	return target.slug === slug ? null : target.slug;
}

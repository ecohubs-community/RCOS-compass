import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { SEAL_LABELS, seal, unseal } from '../crypto/sealed.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { user } from '../db/schema/auth.js';
import { community, communityJoinLink, joinRequest } from '../db/schema/tenancy.js';
import { recordAudit, type AuditAction } from './audit.js';
import { hashToken } from './invitations.js';

/**
 * A community's join link: on, replaced, off. `openspec/changes/pilot-blockers`
 * D3, and the `join-link` spec.
 *
 * One per community, off until a steward turns it on. Whoever follows it can
 * only *ask* to join (`join-requests.ts`); a steward decides. The token is a
 * lookup key (hashed) and a thing a steward copies again next week (sealed);
 * the raw value is never stored.
 */

export type JoinLinkView = { token: string; createdAt: number };

function readable(row: typeof communityJoinLink.$inferSelect): JoinLinkView | null {
	const token = unseal(row.tokenSealed, SEAL_LABELS.joinLink);
	// A secret rotated since the link was made leaves a row nobody can show.
	// Treated as no link: the steward makes a new one.
	return token ? { token, createdAt: row.createdAt.getTime() } : null;
}

/** The link as a steward sees it, or null while it is off. */
export function joinLinkOf(ctx: Ctx, options: { db?: Db } = {}): JoinLinkView | null {
	requirePermission(ctx, 'member.invite');
	const db = options.db ?? getDb();
	const row = db
		.select()
		.from(communityJoinLink)
		.where(eq(communityJoinLink.communityId, ctx.community.id))
		.get();
	return row ? readable(row) : null;
}

function freshToken() {
	const token = randomBytes(32).toString('base64url');
	return { token, tokenHash: hashToken(token), tokenSealed: seal(token, SEAL_LABELS.joinLink) };
}

/**
 * Requests whose address nobody has proven, in this community.
 *
 * Dropped when the link is replaced or turned off: whoever had the old link and
 * never confirmed an address stops holding a place under the cap. A verified
 * request stays — that is a real person a steward has been told about.
 */
function dropUnverifiedRequests(db: Db, communityId: string): void {
	db.delete(joinRequest)
		.where(
			and(
				eq(joinRequest.communityId, communityId),
				inArray(
					joinRequest.userId,
					db.select({ id: user.id }).from(user).where(eq(user.emailVerified, false))
				)
			)
		)
		.run();
}

function audit(db: Db, ctx: Ctx, action: AuditAction) {
	recordAudit(
		db,
		{ now: ctx.now },
		{
			action,
			actorId: ctx.user.id,
			actorEmail: ctx.user.email,
			communityId: ctx.community.id
		}
	);
}

/** Turn the link on. Already on: the same link, nothing rewritten. */
export function turnOnJoinLink(ctx: Ctx, options: { db?: Db } = {}): JoinLinkView {
	requirePermission(ctx, 'member.invite');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const existing = joinLinkOf(ctx, { db });
	if (existing) return existing;

	const now = ctx.now();
	const fresh = freshToken();
	db.transaction((tx) => {
		// A row whose seal no longer opens is replaced rather than kept.
		tx.delete(communityJoinLink).where(eq(communityJoinLink.communityId, ctx.community.id)).run();
		tx.insert(communityJoinLink)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				tokenHash: fresh.tokenHash,
				tokenSealed: fresh.tokenSealed,
				createdBy: ctx.user.id,
				createdAt: new Date(now)
			})
			.run();
		audit(tx as unknown as Db, ctx, 'member.join_link_on');
	});
	return { token: fresh.token, createdAt: now };
}

/** A new link in place of the old one, which stops working at once. */
export function replaceJoinLink(ctx: Ctx, options: { db?: Db } = {}): JoinLinkView {
	requirePermission(ctx, 'member.invite');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const now = ctx.now();
	const fresh = freshToken();
	const replaced = db.transaction((tx) => {
		const result = tx
			.update(communityJoinLink)
			.set({
				tokenHash: fresh.tokenHash,
				tokenSealed: fresh.tokenSealed,
				createdBy: ctx.user.id,
				createdAt: new Date(now)
			})
			.where(eq(communityJoinLink.communityId, ctx.community.id))
			.run();
		if (result.changes === 0) return false;
		dropUnverifiedRequests(tx as unknown as Db, ctx.community.id);
		audit(tx as unknown as Db, ctx, 'member.join_link_replaced');
		return true;
	});
	// Replacing a link that is off is turning one on.
	return replaced ? { token: fresh.token, createdAt: now } : turnOnJoinLink(ctx, { db });
}

/** Off: the link stops working, and nothing is shown until it is turned on again. */
export function turnOffJoinLink(ctx: Ctx, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'member.invite');
	const db = options.db ?? getDb();
	db.transaction((tx) => {
		const result = tx
			.delete(communityJoinLink)
			.where(eq(communityJoinLink.communityId, ctx.community.id))
			.run();
		if (result.changes === 0) return;
		dropUnverifiedRequests(tx as unknown as Db, ctx.community.id);
		audit(tx as unknown as Db, ctx, 'member.join_link_off');
	});
}

/**
 * What a followed link points at, for a page that has no `Ctx` yet.
 *
 * The token is the only authority. A link that was turned off, replaced, never
 * existed, or belongs to a community that is suspended or deleted is the same
 * answer — `dead` — so the page cannot be used to learn which communities
 * exist or what state they are in.
 */
export type JoinLinkTarget =
	| {
			kind: 'open';
			communityId: string;
			communityName: string;
			communitySlug: string;
			communityLocale: string;
	  }
	| { kind: 'dead' };

export function inspectJoinLink(db: Db, token: string): JoinLinkTarget {
	if (!token) return { kind: 'dead' };
	const found = db
		.select({
			communityId: community.id,
			communityName: community.name,
			communitySlug: community.slug,
			communityLocale: community.locale,
			status: community.status
		})
		.from(communityJoinLink)
		.innerJoin(community, eq(community.id, communityJoinLink.communityId))
		.where(eq(communityJoinLink.tokenHash, hashToken(token)))
		.get();
	if (!found || found.status !== 'active') return { kind: 'dead' };
	return {
		kind: 'open',
		communityId: found.communityId,
		communityName: found.communityName,
		communitySlug: found.communitySlug,
		communityLocale: found.communityLocale
	};
}

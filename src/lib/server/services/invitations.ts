import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import type { Clock } from '../clock.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { user } from '../db/schema/auth.js';
import { community, invitation, membership, type Invitation } from '../db/schema/tenancy.js';
import { recordAudit } from './audit.js';
import { registerTenantService } from './registry.js';

/**
 * Becoming a member of a community, exactly once. docs/04-security.md §3.
 *
 * The token is random, single-use, bound to the address it was sent to, and
 * stored only as a hash — the raw value exists in the email and nowhere else, so
 * a copy of the database does not let anyone join anything.
 */

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60_000;

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export type CreatedInvitation = { invitation: Invitation; token: string };

/**
 * The raw token is returned once, for the email, and never again. Re-inviting an
 * address supersedes any live invitation rather than accumulating them — the
 * partial unique index would refuse a second anyway.
 */
export function inviteMember(
	ctx: Ctx,
	input: { email: string; role?: 'steward' | 'member' },
	options: { db?: Db } = {}
): CreatedInvitation {
	requirePermission(ctx, 'member.invite');

	const db = options.db ?? getDb();
	const email = input.email.trim().toLowerCase();
	if (!email.includes('@')) error(400, 'That does not look like an email address.');

	const now = ctx.now();
	const token = randomBytes(32).toString('base64url');

	return db.transaction((tx) => {
		const existingUser = tx.select().from(user).where(eq(user.email, email)).get();
		if (existingUser) {
			const already = tx
				.select()
				.from(membership)
				.where(
					and(
						eq(membership.communityId, ctx.community.id),
						eq(membership.userId, existingUser.id),
						isNull(membership.endedAt)
					)
				)
				.get();
			if (already) error(409, 'That person is already a member of this community.');
		}

		// Supersede rather than accumulate: one live invitation per address.
		tx.update(invitation)
			.set({ revokedAt: new Date(now) })
			.where(
				and(
					eq(invitation.communityId, ctx.community.id),
					eq(invitation.email, email),
					isNull(invitation.acceptedAt),
					isNull(invitation.revokedAt)
				)
			)
			.run();

		const row = {
			id: newId(),
			communityId: ctx.community.id,
			email,
			role: input.role ?? ('member' as const),
			grantsOwner: false,
			tokenHash: hashToken(token),
			expiresAt: new Date(now + INVITATION_TTL_MS),
			acceptedAt: null,
			acceptedBy: null,
			revokedAt: null,
			invitedBy: ctx.user.id,
			createdAt: new Date(now)
		};
		tx.insert(invitation).values(row).run();

		recordAudit(
			tx as unknown as Db,
			{ now: () => now },
			{
				action: 'member.invited',
				actorId: ctx.user.id,
				actorEmail: ctx.user.email,
				communityId: ctx.community.id,
				target: email,
				meta: { role: row.role }
			}
		);

		return { invitation: row, token };
	});
}

export function listInvitations(ctx: Ctx, options: { db?: Db } = {}): Invitation[] {
	requirePermission(ctx, 'member.manage');
	const db = options.db ?? getDb();
	return db
		.select()
		.from(invitation)
		.where(and(eq(invitation.communityId, ctx.community.id), isNull(invitation.acceptedAt)))
		.all();
}

export function revokeInvitation(ctx: Ctx, invitationId: string, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'member.manage');
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(invitation)
		.where(and(eq(invitation.id, invitationId), eq(invitation.communityId, ctx.community.id)))
		.get();
	if (!found) error(404, 'Not found');

	db.update(invitation)
		.set({ revokedAt: new Date(ctx.now()) })
		.where(eq(invitation.id, found.id))
		.run();

	recordAudit(
		db,
		{ now: ctx.now },
		{
			action: 'member.invitation_revoked',
			actorId: ctx.user.id,
			actorEmail: ctx.user.email,
			communityId: ctx.community.id,
			target: found.email
		}
	);
}

export type AcceptResult =
	| { kind: 'accepted'; communitySlug: string; membershipId: string }
	| { kind: 'expired' }
	| { kind: 'already_used' }
	| { kind: 'wrong_address'; invitedEmail: string }
	| { kind: 'unknown' };

/**
 * Accepting, in one transaction.
 *
 * Creating the membership and consuming the invitation must succeed or fail
 * together: a membership without a consumed invitation could be created twice,
 * and a consumed invitation without a membership strands the person entirely.
 */
export function acceptInvitation(
	db: Db,
	clock: Clock,
	input: { token: string; userId: string }
): AcceptResult {
	const now = clock.now();
	const tokenHash = hashToken(input.token);

	return db.transaction((tx) => {
		const found = tx.select().from(invitation).where(eq(invitation.tokenHash, tokenHash)).get();
		if (!found) return { kind: 'unknown' };
		if (found.acceptedAt || found.revokedAt) return { kind: 'already_used' };
		if (found.expiresAt.getTime() <= now) return { kind: 'expired' };

		const accepting = tx.select().from(user).where(eq(user.id, input.userId)).get();
		if (!accepting) return { kind: 'unknown' };

		// Bound to the address it was sent to: otherwise a forwarded email is a way
		// into someone else's community.
		if (accepting.email.trim().toLowerCase() !== found.email) {
			return { kind: 'wrong_address', invitedEmail: found.email };
		}

		const target = tx.select().from(community).where(eq(community.id, found.communityId)).get();
		if (!target || target.status === 'deleted') return { kind: 'unknown' };

		const existing = tx
			.select()
			.from(membership)
			.where(
				and(
					eq(membership.communityId, found.communityId),
					eq(membership.userId, input.userId),
					isNull(membership.endedAt)
				)
			)
			.get();

		const membershipId = existing?.id ?? newId();
		if (!existing) {
			tx.insert(membership)
				.values({
					id: membershipId,
					communityId: found.communityId,
					userId: input.userId,
					role: found.role,
					isOwner: found.grantsOwner,
					rcosState: 'full',
					displayName: null,
					joinedAt: new Date(now),
					endedAt: null
				})
				.run();
		}

		tx.update(invitation)
			.set({ acceptedAt: new Date(now), acceptedBy: input.userId })
			.where(eq(invitation.id, found.id))
			.run();

		recordAudit(tx as unknown as Db, clock, {
			action: 'member.joined',
			actorId: input.userId,
			actorEmail: accepting.email,
			communityId: found.communityId,
			target: membershipId,
			meta: { role: found.role, owner: found.grantsOwner }
		});

		return { kind: 'accepted', communitySlug: target.slug, membershipId };
	});
}

registerTenantService({
	name: 'invitations.revoke',
	subject: 'invitation',
	call: revokeInvitation
});

import { createHash, randomBytes } from 'node:crypto';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import { getDb, type Db } from '../../db/index.js';
import { newId } from '../../db/id.js';
import { community, invitation, membership } from '../../db/schema/tenancy.js';
import { user } from '../../db/schema/auth.js';
import { recordAudit } from '../audit.js';
import { validateSlug } from '../tenancy.js';

/**
 * The platform admin's view of tenants. docs/05-admin-console.md §2.
 *
 * **Metadata only.** This module must never import a content service or query a
 * content table: an operator sees that a community exists and how much of the
 * instance it uses, never what it decided. The boundary is asserted by an import
 * test, because "we didn't mean to" is not a control.
 *
 * The reason to be this strict: the product asks communities to put their most
 * sensitive structural agreements into someone else's software. "The operator
 * technically could" is unavoidable at the database level; "the operator's own
 * tooling cannot" is achievable and is the difference between a promise and a
 * policy.
 */

export type AdminActor = { userId: string; email: string; ip?: string | null };

export type TenantSummary = {
	id: string;
	slug: string;
	name: string;
	status: 'active' | 'suspended' | 'deleted';
	members: number;
	pendingInvitations: number;
	createdAt: number;
	ownerEmail: string | null;
};

export function listTenants(db: Db = getDb()): TenantSummary[] {
	const communities = db.select().from(community).orderBy(desc(community.createdAt)).all();

	return communities.map((row) => {
		const [members] = db
			.select({ n: count() })
			.from(membership)
			.where(and(eq(membership.communityId, row.id), isNull(membership.endedAt)))
			.all();

		const [pending] = db
			.select({ n: count() })
			.from(invitation)
			.where(
				and(
					eq(invitation.communityId, row.id),
					isNull(invitation.acceptedAt),
					isNull(invitation.revokedAt)
				)
			)
			.all();

		// The owner's address is the one piece of personal data the console shows:
		// an operator has to be able to contact someone about the tenant.
		const owner = db
			.select({ email: user.email })
			.from(membership)
			.innerJoin(user, eq(user.id, membership.userId))
			.where(
				and(
					eq(membership.communityId, row.id),
					eq(membership.isOwner, true),
					isNull(membership.endedAt)
				)
			)
			.get();

		return {
			id: row.id,
			slug: row.slug,
			name: row.name,
			status: row.status,
			members: members?.n ?? 0,
			pendingInvitations: pending?.n ?? 0,
			createdAt: row.createdAt.getTime(),
			ownerEmail: owner?.email ?? null
		};
	});
}

export type CreateTenantInput = {
	name: string;
	slug: string;
	ownerEmail: string;
	locale?: string;
	timezone?: string;
};

export class TenantError extends Error {
	constructor(
		readonly reason:
			'slug_reserved' | 'slug_taken' | 'slug_malformed' | 'slug_length' | 'invalid_email',
		message: string
	) {
		super(message);
		this.name = 'TenantError';
	}
}

/**
 * Creates a community and invites its owner. The admin does not become a member:
 * creating a tenant is an operational act, not a way into it.
 */
export function createTenant(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	input: CreateTenantInput
): { communityId: string; invitationToken: string } {
	const slug = input.slug.trim().toLowerCase();
	const email = input.ownerEmail.trim().toLowerCase();
	if (!email.includes('@')) throw new TenantError('invalid_email', 'That is not an email address.');

	const problem = validateSlug(db, slug);
	if (problem === 'reserved') {
		throw new TenantError('slug_reserved', `"${slug}" is reserved by the application.`);
	}
	if (problem === 'taken') throw new TenantError('slug_taken', `"${slug}" is already in use.`);
	if (problem === 'too_short' || problem === 'too_long') {
		throw new TenantError('slug_length', 'A slug is between 3 and 40 characters.');
	}
	if (problem) {
		throw new TenantError('slug_malformed', 'Use lowercase letters, numbers and single hyphens.');
	}

	const now = clock.now();
	const token = randomBytes(32).toString('base64url');
	const communityId = newId();

	db.transaction((tx) => {
		tx.insert(community)
			.values({
				id: communityId,
				slug,
				name: input.name.trim(),
				locale: input.locale ?? 'en',
				timezone: input.timezone ?? 'UTC',
				status: 'active',
				suspendedReason: null,
				deletedAt: null,
				publishNamesPolicy: 'roles_and_counts',
				aiEnabled: false,
				maxMembers: null,
				storageMb: null,
				aiMonthlyTokens: null,
				createdAt: new Date(now),
				updatedAt: new Date(now)
			})
			.run();

		// The owner flag travels with this first invitation.
		tx.insert(invitation)
			.values({
				id: newId(),
				communityId,
				email,
				role: 'steward',
				grantsOwner: true,
				tokenHash: createHash('sha256').update(token).digest('hex'),
				expiresAt: new Date(now + 7 * 24 * 60 * 60_000),
				acceptedAt: null,
				acceptedBy: null,
				revokedAt: null,
				invitedBy: null,
				createdAt: new Date(now)
			})
			.run();

		recordAudit(tx as unknown as Db, clock, {
			action: 'community.created',
			actorId: actor.userId,
			actorEmail: actor.email,
			communityId,
			target: slug,
			ip: actor.ip,
			meta: { ownerEmail: email }
		});
	});

	return { communityId, invitationToken: token };
}

export function suspendTenant(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string,
	reason: string
): void {
	if (!reason.trim()) throw new TenantError('invalid_email', 'A reason is required.');
	db.update(community)
		.set({ status: 'suspended', suspendedReason: reason, updatedAt: new Date(clock.now()) })
		.where(eq(community.id, communityId))
		.run();
	recordAudit(db, clock, {
		action: 'community.suspended',
		actorId: actor.userId,
		actorEmail: actor.email,
		communityId,
		ip: actor.ip,
		meta: { reason }
	});
}

export function unsuspendTenant(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string
): void {
	db.update(community)
		.set({ status: 'active', suspendedReason: null, updatedAt: new Date(clock.now()) })
		.where(eq(community.id, communityId))
		.run();
	recordAudit(db, clock, {
		action: 'community.unsuspended',
		actorId: actor.userId,
		actorEmail: actor.email,
		communityId,
		ip: actor.ip
	});
}

/** Soft delete, recoverable for a grace period. Hard deletion is a job, never a button. */
export const DELETE_GRACE_MS = 30 * 24 * 60 * 60_000;

export function deleteTenant(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string,
	reason: string
): void {
	const now = clock.now();
	db.update(community)
		.set({ status: 'deleted', deletedAt: new Date(now), updatedAt: new Date(now) })
		.where(eq(community.id, communityId))
		.run();
	recordAudit(db, clock, {
		action: 'community.deleted',
		actorId: actor.userId,
		actorEmail: actor.email,
		communityId,
		ip: actor.ip,
		meta: { reason, purgeAfter: now + DELETE_GRACE_MS }
	});
}

export function restoreTenant(db: Db, clock: Clock, actor: AdminActor, communityId: string): void {
	const found = db.select().from(community).where(eq(community.id, communityId)).get();
	if (!found || found.status !== 'deleted') return;

	const now = clock.now();
	if (found.deletedAt && now - found.deletedAt.getTime() > DELETE_GRACE_MS) {
		throw new TenantError('slug_taken', 'The grace period has passed; this cannot be restored.');
	}

	db.update(community)
		.set({ status: 'active', deletedAt: null, updatedAt: new Date(now) })
		.where(eq(community.id, communityId))
		.run();
	recordAudit(db, clock, {
		action: 'community.restored',
		actorId: actor.userId,
		actorEmail: actor.email,
		communityId,
		ip: actor.ip
	});
}

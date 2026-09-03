import { createHash, randomBytes } from 'node:crypto';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import { getDb, type Db } from '../../db/index.js';
import { newId } from '../../db/id.js';
import {
	community,
	communitySlugRedirect,
	invitation,
	membership
} from '../../db/schema/tenancy.js';
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

export type TenantErrorReason =
	| 'slug_reserved'
	| 'slug_taken'
	| 'slug_malformed'
	| 'slug_length'
	| 'slug_retired'
	| 'invalid_email'
	| 'invalid_name'
	| 'reason_required'
	| 'grace_expired'
	| 'no_such_tenant'
	| 'not_a_steward'
	| 'already_owner'
	| 'only_one_steward'
	| 'invalid_limit';

export class TenantError extends Error {
	constructor(
		readonly reason: TenantErrorReason,
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
	if (!reason.trim()) throw new TenantError('reason_required', 'A reason is required.');
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
		throw new TenantError('grace_expired', 'The grace period has passed; this cannot be restored.');
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

/** How long a retired slug keeps redirecting. docs/05-admin-console.md §3.3. */
export const SLUG_REDIRECT_MS = 90 * 24 * 60 * 60_000;

function requireTenant(db: Db, communityId: string) {
	const found = db.select().from(community).where(eq(community.id, communityId)).get();
	if (!found) throw new TenantError('no_such_tenant', 'No such community.');
	return found;
}

/** Rename. Free, reversible, and does not touch the address. */
export function renameTenant(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string,
	name: string
): void {
	const trimmed = name.trim();
	if (trimmed.length < 2 || trimmed.length > 120) {
		throw new TenantError('invalid_name', 'A name is between 2 and 120 characters.');
	}

	const before = requireTenant(db, communityId);
	if (before.name === trimmed) return;

	db.update(community)
		.set({ name: trimmed, updatedAt: new Date(clock.now()) })
		.where(eq(community.id, communityId))
		.run();

	recordAudit(db, clock, {
		action: 'community.renamed',
		actorId: actor.userId,
		actorEmail: actor.email,
		communityId,
		target: before.slug,
		ip: actor.ip,
		// Before and after, because §5.4 asks the trail to answer "what changed".
		meta: { from: before.name, to: trimmed }
	});
}

/**
 * Change the address, leaving the old one redirecting.
 *
 * The retired slug is kept in `community_slug_redirect` rather than merely
 * released, and it is *not* available to another community while it redirects —
 * handing a retired name to a different tenant would silently point old links
 * at the wrong community, which is worse than breaking them.
 */
export function changeTenantSlug(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string,
	slug: string
): void {
	const next = slug.trim().toLowerCase();
	const before = requireTenant(db, communityId);
	if (before.slug === next) return;

	const problem = validateSlug(db, next);
	if (problem === 'reserved') {
		throw new TenantError('slug_reserved', `"${next}" is reserved by the application.`);
	}
	if (problem === 'taken') throw new TenantError('slug_taken', `"${next}" is already in use.`);
	if (problem === 'too_short' || problem === 'too_long') {
		throw new TenantError('slug_length', 'A slug is between 3 and 40 characters.');
	}
	if (problem) {
		throw new TenantError('slug_malformed', 'Use lowercase letters, numbers and single hyphens.');
	}

	const retired = db
		.select()
		.from(communitySlugRedirect)
		.where(eq(communitySlugRedirect.oldSlug, next))
		.get();
	if (retired && retired.communityId !== communityId) {
		throw new TenantError(
			'slug_retired',
			`"${next}" still redirects to another community and cannot be reused yet.`
		);
	}

	const now = clock.now();
	db.transaction((tx) => {
		tx.update(community)
			.set({ slug: next, updatedAt: new Date(now) })
			.where(eq(community.id, communityId))
			.run();

		// Taking the new name back from its own redirect list, so a community that
		// changes its mind does not end up redirecting to itself.
		tx.delete(communitySlugRedirect).where(eq(communitySlugRedirect.oldSlug, next)).run();

		tx.insert(communitySlugRedirect)
			.values({
				id: newId(),
				oldSlug: before.slug,
				communityId,
				createdAt: new Date(now),
				expiresAt: new Date(now + SLUG_REDIRECT_MS)
			})
			.onConflictDoUpdate({
				target: communitySlugRedirect.oldSlug,
				set: { communityId, createdAt: new Date(now), expiresAt: new Date(now + SLUG_REDIRECT_MS) }
			})
			.run();

		recordAudit(tx as unknown as Db, clock, {
			action: 'community.slug_changed',
			actorId: actor.userId,
			actorEmail: actor.email,
			communityId,
			target: next,
			ip: actor.ip,
			meta: { from: before.slug, to: next, redirectUntil: now + SLUG_REDIRECT_MS }
		});
	});
}

export type TenantLimits = {
	/** Null means "the instance default" — unlimited during the testing phase. */
	maxMembers: number | null;
	storageMb: number | null;
	aiMonthlyTokens: number | null;
};

/**
 * Set quotas. A *reduction* is destructive in the sense §5.5 means it — a
 * community can be over its new limit the moment it is applied — so the caller
 * supplies a reason and it is stored on the event.
 */
export function setTenantLimits(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string,
	limits: TenantLimits,
	reason: string
): void {
	for (const [field, value] of Object.entries(limits)) {
		if (value === null) continue;
		if (!Number.isInteger(value) || value < 0) {
			throw new TenantError('invalid_limit', `${field} must be a whole number, or blank.`);
		}
	}

	const before = requireTenant(db, communityId);
	const lowered =
		(limits.maxMembers !== null &&
			(before.maxMembers === null || limits.maxMembers < before.maxMembers)) ||
		(limits.storageMb !== null &&
			(before.storageMb === null || limits.storageMb < before.storageMb)) ||
		(limits.aiMonthlyTokens !== null &&
			(before.aiMonthlyTokens === null || limits.aiMonthlyTokens < before.aiMonthlyTokens));
	if (lowered && !reason.trim()) {
		throw new TenantError('reason_required', 'Tightening a limit needs a reason.');
	}

	db.update(community)
		.set({ ...limits, updatedAt: new Date(clock.now()) })
		.where(eq(community.id, communityId))
		.run();

	recordAudit(db, clock, {
		action: 'community.limits_changed',
		actorId: actor.userId,
		actorEmail: actor.email,
		communityId,
		target: before.slug,
		ip: actor.ip,
		meta: {
			from: {
				maxMembers: before.maxMembers,
				storageMb: before.storageMb,
				aiMonthlyTokens: before.aiMonthlyTokens
			},
			to: limits,
			tightened: lowered,
			reason: reason.trim() || null
		}
	});
}

export type TenantFlags = {
	aiEnabled: boolean;
	gitMirrorEnabled: boolean;
	publicIndexEnabled: boolean;
};

/** Turn features on or off for one tenant. */
export function setTenantFlags(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string,
	flags: TenantFlags
): void {
	const before = requireTenant(db, communityId);

	db.update(community)
		.set({ ...flags, updatedAt: new Date(clock.now()) })
		.where(eq(community.id, communityId))
		.run();

	recordAudit(db, clock, {
		action: 'community.flags_changed',
		actorId: actor.userId,
		actorEmail: actor.email,
		communityId,
		target: before.slug,
		ip: actor.ip,
		meta: {
			from: {
				aiEnabled: before.aiEnabled,
				gitMirrorEnabled: before.gitMirrorEnabled,
				publicIndexEnabled: before.publicIndexEnabled
			},
			to: flags
		}
	});
}

/**
 * Move the owner flag to another steward.
 *
 * Three refusals, each protecting an invariant the schema also enforces
 * (`membership_one_owner_idx`): the target must be a *current* member, must be a
 * steward — the flag never sits on a `member`, per docs/04-security.md §1 — and
 * there must be someone to move it to, so a single-steward community is told to
 * promote first rather than being quietly left without an owner.
 */
export function transferOwnership(
	db: Db,
	clock: Clock,
	actor: AdminActor,
	communityId: string,
	toUserId: string
): void {
	const tenant = requireTenant(db, communityId);

	const stewards = db
		.select()
		.from(membership)
		.where(
			and(
				eq(membership.communityId, communityId),
				eq(membership.role, 'steward'),
				isNull(membership.endedAt)
			)
		)
		.all();

	const target = stewards.find((m) => m.userId === toUserId);
	if (!target) {
		// Not-a-member and not-a-steward are one answer: either way the flag
		// cannot go there, and the console shows the eligible list anyway.
		throw new TenantError('not_a_steward', 'The new owner must be a current steward.');
	}
	if (target.isOwner) throw new TenantError('already_owner', 'They already hold the owner flag.');
	if (stewards.length < 2) {
		throw new TenantError(
			'only_one_steward',
			'There is only one steward. Promote someone to steward first.'
		);
	}

	const current = stewards.find((m) => m.isOwner);
	const now = clock.now();

	db.transaction((tx) => {
		// Cleared first: the partial unique index allows exactly one owner per
		// community, so setting before clearing would collide.
		if (current) {
			tx.update(membership).set({ isOwner: false }).where(eq(membership.id, current.id)).run();
		}
		tx.update(membership).set({ isOwner: true }).where(eq(membership.id, target.id)).run();
		tx.update(community)
			.set({ updatedAt: new Date(now) })
			.where(eq(community.id, communityId))
			.run();

		recordAudit(tx as unknown as Db, clock, {
			action: 'community.ownership_transferred',
			actorId: actor.userId,
			actorEmail: actor.email,
			communityId,
			target: tenant.slug,
			ip: actor.ip,
			meta: { from: current?.userId ?? null, to: toUserId }
		});
	});
}

export type TenantSteward = { userId: string; email: string; isOwner: boolean };

export type TenantDetail = TenantSummary & {
	locale: string;
	timezone: string;
	suspendedReason: string | null;
	deletedAt: number | null;
	/** When a soft-deleted tenant stops being recoverable. */
	purgeAfter: number | null;
	limits: TenantLimits;
	flags: TenantFlags;
	stewards: TenantSteward[];
	retiredSlugs: { slug: string; expiresAt: number }[];
};

/**
 * One tenant, in full — still metadata only. The steward list carries addresses
 * because ownership transfer has to name someone; nothing else about a member
 * crosses the boundary.
 */
export function getTenant(db: Db, communityId: string): TenantDetail | null {
	const row = db.select().from(community).where(eq(community.id, communityId)).get();
	if (!row) return null;

	const summary = listTenants(db).find((t) => t.id === communityId);
	if (!summary) return null;

	const stewards = db
		.select({ userId: membership.userId, email: user.email, isOwner: membership.isOwner })
		.from(membership)
		.innerJoin(user, eq(user.id, membership.userId))
		.where(
			and(
				eq(membership.communityId, communityId),
				eq(membership.role, 'steward'),
				isNull(membership.endedAt)
			)
		)
		.all();

	const retiredSlugs = db
		.select()
		.from(communitySlugRedirect)
		.where(eq(communitySlugRedirect.communityId, communityId))
		.all()
		.map((r) => ({ slug: r.oldSlug, expiresAt: r.expiresAt.getTime() }));

	return {
		...summary,
		locale: row.locale,
		timezone: row.timezone,
		suspendedReason: row.suspendedReason,
		deletedAt: row.deletedAt?.getTime() ?? null,
		purgeAfter: row.deletedAt ? row.deletedAt.getTime() + DELETE_GRACE_MS : null,
		limits: {
			maxMembers: row.maxMembers,
			storageMb: row.storageMb,
			aiMonthlyTokens: row.aiMonthlyTokens
		},
		flags: {
			aiEnabled: row.aiEnabled,
			gitMirrorEnabled: row.gitMirrorEnabled,
			publicIndexEnabled: row.publicIndexEnabled
		},
		stewards,
		retiredSlugs
	};
}

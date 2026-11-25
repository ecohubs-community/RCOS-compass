import { and, asc, count, eq, isNull, lt, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import type { Clock } from '../clock.js';
import { isPlatformAdmin } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { user } from '../db/schema/auth.js';
import { community, invitation, joinRequest, membership } from '../db/schema/tenancy.js';
import { getLogger } from '../logger.js';
import { recordAudit } from './audit.js';
import { erasePerson } from './erasure.js';
import { nextMembershipSeq } from './invitations.js';
import { inspectJoinLink } from './join-link.js';
import { activeHolders, notify } from './notifications.js';
import { registerTenantService } from './registry.js';

/**
 * Asking to join through a link, and a steward deciding.
 * `openspec/changes/pilot-blockers` D4–D6, the `join-link` spec.
 *
 * A request is never a membership. Stewards hear of it only once the address
 * behind it is proven, are told exactly once, and see no name in the
 * notification — the name is on the Members page, behind `member.invite`.
 */

/** Open requests one community may hold, verified or not. */
export const JOIN_REQUESTS_PER_COMMUNITY = 50;
/** An unverified request older than this is dropped by the hourly sweep. */
export const UNVERIFIED_REQUEST_TTL_MS = 7 * 24 * 60 * 60_000;

export type RequestOutcome =
	| { kind: 'requested'; communityName: string; told: boolean }
	| { kind: 'waiting'; communityName: string }
	| { kind: 'joined'; communitySlug: string }
	| { kind: 'full'; communityName: string }
	| { kind: 'dead' };

/**
 * One person asks one community, through its link.
 *
 * Writes at most a request. An account that is already verified (someone
 * signed in, asking with the account they have) tells the stewards now; one
 * that is not waits for `noteVerifiedJoinRequests`.
 */
export function requestToJoin(
	db: Db,
	clock: Clock,
	input: { token: string; userId: string }
): RequestOutcome {
	const target = inspectJoinLink(db, input.token);
	if (target.kind === 'dead') return { kind: 'dead' };

	const person = db.select().from(user).where(eq(user.id, input.userId)).get();
	if (!person || person.erasedAt) return { kind: 'dead' };

	const outcome = db.transaction((tx): RequestOutcome | { kind: 'new'; id: string } => {
		const seat = tx
			.select({ id: membership.id })
			.from(membership)
			.where(
				and(
					eq(membership.communityId, target.communityId),
					eq(membership.userId, input.userId),
					isNull(membership.endedAt)
				)
			)
			.get();
		if (seat) return { kind: 'joined', communitySlug: target.communitySlug };

		const already = tx
			.select({ id: joinRequest.id })
			.from(joinRequest)
			.where(
				and(eq(joinRequest.communityId, target.communityId), eq(joinRequest.userId, input.userId))
			)
			.get();
		if (already) return { kind: 'waiting', communityName: target.communityName };

		if (joinQueueIsFull(tx as unknown as Db, target.communityId)) {
			return { kind: 'full', communityName: target.communityName };
		}

		const id = newId();
		tx.insert(joinRequest)
			.values({
				id,
				communityId: target.communityId,
				userId: input.userId,
				createdAt: new Date(clock.now()),
				notifiedAt: null
			})
			.run();
		recordAudit(tx as unknown as Db, clock, {
			action: 'member.join_requested',
			actorId: person.id,
			actorEmail: person.email,
			communityId: target.communityId,
			target: id
		});
		return { kind: 'new', id };
	});

	if (outcome.kind !== 'new') return outcome;
	const told = person.emailVerified ? tellStewards(db, clock, outcome.id) : false;
	return { kind: 'requested', communityName: target.communityName, told };
}

/**
 * Whether a community can take another request, asked before an account is
 * made for one: a full queue must not leave an account behind it.
 */
export function joinQueueIsFull(db: Db, communityId: string): boolean {
	const held = db
		.select({ n: count() })
		.from(joinRequest)
		.where(eq(joinRequest.communityId, communityId))
		.get();
	return (held?.n ?? 0) >= JOIN_REQUESTS_PER_COMMUNITY;
}

/** Where a signed-in person stands with one community, without writing anything. */
export function joinStatusOf(
	db: Db,
	communityId: string,
	userId: string
): 'joined' | 'waiting' | 'none' {
	const seat = db
		.select({ id: membership.id })
		.from(membership)
		.where(
			and(
				eq(membership.communityId, communityId),
				eq(membership.userId, userId),
				isNull(membership.endedAt)
			)
		)
		.get();
	if (seat) return 'joined';
	const waiting = db
		.select({ id: joinRequest.id })
		.from(joinRequest)
		.where(and(eq(joinRequest.communityId, communityId), eq(joinRequest.userId, userId)))
		.get();
	return waiting ? 'waiting' : 'none';
}

/**
 * Tell a community's stewards about one request, once.
 *
 * The conditional update is the "once": whoever sets `notified_at` first does
 * the telling, and a second verification — or a request made by an account
 * that was already verified — finds it set and tells nobody.
 */
function tellStewards(db: Db, clock: Clock, requestId: string): boolean {
	const now = clock.now();
	const claimed = db
		.update(joinRequest)
		.set({ notifiedAt: new Date(now) })
		.where(and(eq(joinRequest.id, requestId), isNull(joinRequest.notifiedAt)))
		.returning({ communityId: joinRequest.communityId })
		.get();
	if (!claimed) return false;

	notify(
		db,
		{ community: { id: claimed.communityId }, membership: null, now: clock.now },
		{
			kind: 'membership.join_requested',
			subjectType: 'members',
			subjectId: claimed.communityId,
			summary: 'Someone asked to join',
			params: {},
			recipients: activeHolders(db, claimed.communityId, 'member.invite'),
			mail: true
		}
	);
	return true;
}

/**
 * Called when an address is verified (`auth.ts`, `afterEmailVerification`).
 *
 * Every request of that person nobody has been told about is now real, and its
 * stewards hear of it. Returns how many requests were told about.
 */
export function noteVerifiedJoinRequests(db: Db, clock: Clock, userId: string): number {
	const pending = db
		.select({ id: joinRequest.id })
		.from(joinRequest)
		.innerJoin(user, eq(user.id, joinRequest.userId))
		.where(
			and(
				eq(joinRequest.userId, userId),
				isNull(joinRequest.notifiedAt),
				eq(user.emailVerified, true)
			)
		)
		.all();
	return pending.filter((row) => tellStewards(db, clock, row.id)).length;
}

export type JoinRequestView = {
	id: string;
	name: string;
	email: string;
	askedAt: number;
};

/**
 * What stewards decide on: requests whose address is proven, from people who
 * are not already members (an invitation may have got there first).
 */
export function listJoinRequests(ctx: Ctx, options: { db?: Db } = {}): JoinRequestView[] {
	requirePermission(ctx, 'member.invite');
	const db = options.db ?? getDb();
	const rows = db
		.select({
			id: joinRequest.id,
			userId: joinRequest.userId,
			name: user.name,
			email: user.email,
			askedAt: joinRequest.createdAt
		})
		.from(joinRequest)
		.innerJoin(user, eq(user.id, joinRequest.userId))
		.where(and(eq(joinRequest.communityId, ctx.community.id), eq(user.emailVerified, true)))
		.orderBy(asc(joinRequest.createdAt))
		.all();
	const members = new Set(
		db
			.select({ userId: membership.userId })
			.from(membership)
			.where(and(eq(membership.communityId, ctx.community.id), isNull(membership.endedAt)))
			.all()
			.map((row) => row.userId)
	);
	return rows
		.filter((row) => !members.has(row.userId))
		.map(({ id, name, email, askedAt }) => ({ id, name, email, askedAt: askedAt.getTime() }));
}

/** The communities a signed-in person is waiting on, for the `/join` page. */
export function openRequestsOf(db: Db, userId: string): { communityName: string }[] {
	return db
		.select({ communityName: community.name })
		.from(joinRequest)
		.innerJoin(community, eq(community.id, joinRequest.communityId))
		.where(and(eq(joinRequest.userId, userId), eq(community.status, 'active')))
		.orderBy(asc(community.name))
		.all();
}

function findRequest(db: Db, ctx: Ctx, requestId: string) {
	const found = db
		.select()
		.from(joinRequest)
		.where(and(eq(joinRequest.id, requestId), eq(joinRequest.communityId, ctx.community.id)))
		.get();
	// Already decided, never this community's, or never existed: one answer.
	if (!found) error(404, 'Not found');
	return found;
}

export type AdmitOutcome = { kind: 'admitted' | 'already_member'; name: string };

/** Let them in: the membership, and the request gone, in one transaction. */
export function admitJoinRequest(
	ctx: Ctx,
	requestId: string,
	options: { db?: Db } = {}
): AdmitOutcome {
	requirePermission(ctx, 'member.invite');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();

	const result = db.transaction((tx) => {
		const found = findRequest(tx as unknown as Db, ctx, requestId);
		const person = tx.select().from(user).where(eq(user.id, found.userId)).get();
		// Stewards are never shown an unproven request; one cannot be let in.
		if (!person || !person.emailVerified || person.erasedAt) error(404, 'Not found');

		tx.delete(joinRequest).where(eq(joinRequest.id, found.id)).run();

		const seat = tx
			.select({ id: membership.id })
			.from(membership)
			.where(
				and(
					eq(membership.communityId, ctx.community.id),
					eq(membership.userId, person.id),
					isNull(membership.endedAt)
				)
			)
			.get();
		if (seat) return { kind: 'already_member' as const, name: person.name, membershipId: null };

		const membershipId = newId();
		tx.insert(membership)
			.values({
				id: membershipId,
				communityId: ctx.community.id,
				userId: person.id,
				role: 'member',
				isOwner: false,
				// As an accepted invitation sets it: content, never authority.
				rcosState: 'full',
				displayName: null,
				seq: nextMembershipSeq(tx as unknown as Db, ctx.community.id),
				joinedAt: new Date(now),
				endedAt: null
			})
			.run();

		recordAudit(
			tx as unknown as Db,
			{ now: ctx.now },
			{
				action: 'member.joined',
				actorId: ctx.user.id,
				actorEmail: ctx.user.email,
				communityId: ctx.community.id,
				target: membershipId,
				meta: { role: 'member', via: 'join_link', person: person.id }
			}
		);
		return { kind: 'admitted' as const, name: person.name, membershipId };
	});

	if (result.membershipId) {
		notify(db, ctx, {
			kind: 'membership.join_approved',
			subjectType: 'community',
			subjectId: ctx.community.id,
			summary: `You can open ${ctx.community.name}`,
			params: {},
			recipients: [result.membershipId],
			mail: true
		});
	}
	return { kind: result.kind, name: result.name };
}

/**
 * Whether an account is somebody's only through a join link, and can go.
 *
 * Erased only if nothing else holds it: never a membership anywhere (ended
 * ones count — the register still names them), no other request waiting, no
 * invitation open to that address in any community (erasure would revoke it,
 * and with it another community's welcome), and not a platform admin. The
 * address is freed, so the person can ask again.
 */
function eraseIfAbandoned(
	db: Db,
	person: { id: string; email: string; emailVerified: boolean },
	actorId: string,
	now: number
): boolean {
	const everMember = db
		.select({ n: count() })
		.from(membership)
		.where(eq(membership.userId, person.id))
		.get();
	const otherRequests = db
		.select({ n: count() })
		.from(joinRequest)
		.where(eq(joinRequest.userId, person.id))
		.get();
	const invited = db
		.select({ n: count() })
		.from(invitation)
		.where(
			and(
				sql`lower(${invitation.email}) = ${person.email.toLowerCase()}`,
				isNull(invitation.acceptedAt),
				isNull(invitation.revokedAt)
			)
		)
		.get();
	const abandoned =
		(everMember?.n ?? 0) === 0 &&
		(otherRequests?.n ?? 0) === 0 &&
		(invited?.n ?? 0) === 0 &&
		!isPlatformAdmin(person.email, person.emailVerified);
	if (!abandoned) return false;
	try {
		erasePerson(db, { userId: person.id, actorId, now });
		return true;
	} catch (problem) {
		// The decision stands either way; an account left behind is tidied by hand.
		getLogger().error(
			{ err: problem instanceof Error ? problem.message : String(problem) },
			'abandoned join-link account not erased'
		);
		return false;
	}
}

export type DeclineOutcome = {
	/** For the decline mail, which the route sends: they are not a member. */
	email: string;
	erased: boolean;
};

/**
 * Decline: the request gone, and — when the account has never belonged
 * anywhere — the account erased, which frees its address (D5).
 */
export function declineJoinRequest(
	ctx: Ctx,
	requestId: string,
	options: { db?: Db } = {}
): DeclineOutcome {
	requirePermission(ctx, 'member.invite');
	const db = options.db ?? getDb();

	const person = db.transaction((tx) => {
		const found = findRequest(tx as unknown as Db, ctx, requestId);
		const who = tx.select().from(user).where(eq(user.id, found.userId)).get();
		if (!who || !who.emailVerified || who.erasedAt) error(404, 'Not found');
		tx.delete(joinRequest).where(eq(joinRequest.id, found.id)).run();
		recordAudit(
			tx as unknown as Db,
			{ now: ctx.now },
			{
				action: 'member.join_declined',
				actorId: ctx.user.id,
				actorEmail: ctx.user.email,
				communityId: ctx.community.id,
				target: who.email
			}
		);
		return who;
	});

	const erased = eraseIfAbandoned(db, person, ctx.user.id, ctx.now());
	return { email: person.email, erased };
}

/**
 * The hourly sweep's part: unverified requests older than a week go, so an
 * abandoned sign-up stops holding a place under the cap. Idempotent by nature.
 */
export function dropStaleJoinRequests(db: Db, communityId: string, now: number): number {
	const stale = db
		.select({ id: joinRequest.id })
		.from(joinRequest)
		.innerJoin(user, eq(user.id, joinRequest.userId))
		.where(
			and(
				eq(joinRequest.communityId, communityId),
				eq(user.emailVerified, false),
				lt(joinRequest.createdAt, new Date(now - UNVERIFIED_REQUEST_TTL_MS))
			)
		)
		.all();
	for (const row of stale) db.delete(joinRequest).where(eq(joinRequest.id, row.id)).run();
	return stale.length;
}

/**
 * Accounts a join link made that nobody confirmed within a week, and that
 * nothing else holds: erased, so a name and an address typed into a public
 * form do not stay forever (`docs/13-data-inventory.md`). Runs after the
 * per-community step has dropped their requests, and catches the ones a
 * replaced link dropped earlier. Only unverified accounts are ever made
 * without an invitation, so an unverified account is a join-link account.
 * Recorded as erased by the person themselves: nobody else acted.
 */
export function eraseAbandonedJoinAccounts(db: Db, now: number): number {
	const candidates = db
		.select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
		.from(user)
		.where(
			and(
				eq(user.emailVerified, false),
				isNull(user.erasedAt),
				lt(user.createdAt, new Date(now - UNVERIFIED_REQUEST_TTL_MS))
			)
		)
		.all();
	return candidates.filter((person) => eraseIfAbandoned(db, person, person.id, now)).length;
}

registerTenantService({
	name: 'join_requests.admit',
	subject: 'joinRequest',
	call: (ctx, id) => admitJoinRequest(ctx, id)
});

registerTenantService({
	name: 'join_requests.decline',
	subject: 'joinRequest',
	call: (ctx, id) => declineJoinRequest(ctx, id)
});

import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { ownerRoleIsValid } from '../auth/permissions.js';
import { getDb } from '../db/index.js';
import { membershipLabel, personLabel } from './person.js';
import { membership, type Membership } from '../db/schema/tenancy.js';
import { user } from '../db/schema/auth.js';
import { registerTenantService } from './registry.js';

/**
 * Members of one community.
 *
 * Every query filters on `ctx.community.id`. A membership id from another
 * community is not "forbidden" here — it simply is not found, which is the same
 * answer a caller gets for an id that never existed.
 */

export type MemberView = {
	membershipId: string;
	userId: string;
	/** Through `personLabel`, always. `src/lib/server/services/person.ts`. */
	name: string;
	/** `M-0142` — their number in this community, which outlives them. */
	number: string;
	role: Membership['role'];
	isOwner: boolean;
	rcosState: Membership['rcosState'];
	/** When they left. Null for everyone `listMembers` returns. */
	endedAt: number | null;
};

function read(ctx: Ctx, whether: SQL): MemberView[] {
	return (
		getDb()
			.select({
				membershipId: membership.id,
				userId: membership.userId,
				name: user.name,
				displayName: membership.displayName,
				seq: membership.seq,
				erasedAt: user.erasedAt,
				role: membership.role,
				isOwner: membership.isOwner,
				rcosState: membership.rcosState,
				endedAt: membership.endedAt
			})
			.from(membership)
			.innerJoin(user, eq(user.id, membership.userId))
			.where(and(eq(membership.communityId, ctx.community.id), whether))
			// By the community's own numbering rather than by insertion order, so the
			// list reads the same way twice and next to the numbers it prints.
			.orderBy(membership.seq)
			.all()
			.map(({ name, displayName, seq, erasedAt, endedAt, ...row }) => ({
				...row,
				// Through the one function, like every other surface. A member list
				// that quietly dropped an erased person would make the community's own
				// count disagree with its decision tallies.
				name: personLabel({ erasedAt, name, displayName, seq }),
				number: membershipLabel(seq),
				endedAt: endedAt?.getTime() ?? null
			}))
	);
}

export function listMembers(ctx: Ctx): MemberView[] {
	requirePermission(ctx, 'community.read');
	return read(ctx, isNull(membership.endedAt));
}

/**
 * And the people who are no longer members, which is a separate question rather
 * than a filter somebody forgot.
 *
 * `endMembership` ends access and keeps the row, because the register refers to
 * memberships: `DEC-2026-004` was consented to by eleven people, and one of them
 * leaving in March does not make it ten. A screen that showed only current
 * members would therefore print a count that disagrees with the community's own
 * decisions, and disagrees silently — which is the same failure as omitting an
 * erased person, one table over.
 *
 * Readable by any member, not only a steward: who used to be here is part of
 * what a community knows about itself.
 */
export function listFormerMembers(ctx: Ctx): MemberView[] {
	requirePermission(ctx, 'community.read');
	return read(ctx, isNotNull(membership.endedAt));
}

function findInCommunity(ctx: Ctx, membershipId: string): Membership | undefined {
	return getDb()
		.select()
		.from(membership)
		.where(and(eq(membership.id, membershipId), eq(membership.communityId, ctx.community.id)))
		.get();
}

export function getMember(ctx: Ctx, membershipId: string): Membership {
	requirePermission(ctx, 'community.read');
	const found = findInCommunity(ctx, membershipId);
	if (!found) error(404, 'Not found');
	return found;
}

/**
 * Neither of the two acts below may be aimed at the person making it.
 *
 * `member.manage` is a steward capability, so the only self-change reachable
 * here is a steward taking their own authority away — and it is the one change
 * that cannot be undone by the person who made it. A steward who demotes
 * themselves by mistake is a member, and a member may not promote anybody; a
 * community whose last steward removed themselves has nobody left who can
 * record a decision, invite anyone or fix it.
 *
 * Refused in the service rather than hidden on the screen, because a control a
 * page declines to draw is still a form somebody can post. The member list does
 * both: this is the rule, and the screen explains it where the control would
 * have been.
 */
function refuseIfSelf(ctx: Ctx, target: Membership, instruction: string): void {
	if (target.id === ctx.membership.id) error(409, instruction);
}

export function setMemberRole(
	ctx: Ctx,
	membershipId: string,
	role: Membership['role']
): Membership {
	requirePermission(ctx, 'member.manage');

	const target = findInCommunity(ctx, membershipId);
	if (!target) error(404, 'Not found');

	// The owner is the one accountable for transfer and deletion; demoting them
	// would leave a community with no one who can do either.
	if (target.isOwner && !ownerRoleIsValid(role)) {
		error(409, 'Transfer ownership before changing this member’s role.');
	}

	// After the owner check, so the owner still gets the instruction that is
	// actually useful to them rather than this one.
	refuseIfSelf(ctx, target, 'Ask another steward to change your role.');

	getDb().update(membership).set({ role }).where(eq(membership.id, target.id)).run();
	return { ...target, role };
}

export function endMembership(ctx: Ctx, membershipId: string): void {
	requirePermission(ctx, 'member.manage');

	const target = findInCommunity(ctx, membershipId);
	if (!target) error(404, 'Not found');
	if (target.isOwner) error(409, 'Transfer ownership before removing this member.');
	refuseIfSelf(ctx, target, 'Ask another steward to end your membership.');

	// The record stays — the register needs it — and the access ends.
	getDb()
		.update(membership)
		.set({ endedAt: new Date(ctx.now()) })
		.where(eq(membership.id, target.id))
		.run();
}

registerTenantService({ name: 'members.get', subject: 'membership', call: getMember });
registerTenantService({
	name: 'members.setRole',
	subject: 'membership',
	call: (ctx, id) => setMemberRole(ctx, id, 'member')
});
registerTenantService({ name: 'members.end', subject: 'membership', call: endMembership });

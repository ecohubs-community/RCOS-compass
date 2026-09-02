import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { ownerRoleIsValid } from '../auth/permissions.js';
import { getDb } from '../db/index.js';
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
	name: string;
	role: Membership['role'];
	isOwner: boolean;
	rcosState: Membership['rcosState'];
};

export function listMembers(ctx: Ctx): MemberView[] {
	requirePermission(ctx, 'community.read');

	return getDb()
		.select({
			membershipId: membership.id,
			userId: membership.userId,
			name: user.name,
			role: membership.role,
			isOwner: membership.isOwner,
			rcosState: membership.rcosState
		})
		.from(membership)
		.innerJoin(user, eq(user.id, membership.userId))
		.where(and(eq(membership.communityId, ctx.community.id), isNull(membership.endedAt)))
		.all();
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

	getDb().update(membership).set({ role }).where(eq(membership.id, target.id)).run();
	return { ...target, role };
}

export function endMembership(ctx: Ctx, membershipId: string): void {
	requirePermission(ctx, 'member.manage');

	const target = findInCommunity(ctx, membershipId);
	if (!target) error(404, 'Not found');
	if (target.isOwner) error(409, 'Transfer ownership before removing this member.');

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

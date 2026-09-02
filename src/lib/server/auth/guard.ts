import { error } from '@sveltejs/kit';
import type { Community, Membership } from '../db/schema/tenancy.js';
import type { User } from '../db/schema/auth.js';
import { can, type Capability } from './permissions.js';

/**
 * The context every service takes. docs/00-architecture.md §3.
 *
 * The community is resolved from the URL by the request pipeline and passed in;
 * a service never accepts a community id from client input, which is what makes
 * cross-tenant access structurally impossible rather than merely checked.
 */
export type Ctx = {
	user: User;
	community: Community;
	membership: Membership;
	now: () => number;
};

export class ForbiddenError extends Error {
	constructor(readonly capability: Capability) {
		super(`Not permitted: ${capability}`);
		this.name = 'ForbiddenError';
	}
}

/**
 * The single place a permission decision is made.
 *
 * Throws a 403 for something inside this community the actor may not do, and
 * lets the pipeline's 404 handle anything belonging to a community they are not
 * in — existence is not disclosed across the tenant boundary
 * (docs/04-security.md §2).
 */
export function requirePermission(ctx: Ctx, capability: Capability): void {
	const actor = { role: ctx.membership.role, isOwner: ctx.membership.isOwner };
	if (!can(actor, capability)) {
		error(403, `You do not have permission to do that (${capability}).`);
	}
}

/** Non-throwing form, for shaping what a page offers rather than guarding it. */
export function ctxCan(ctx: Ctx, capability: Capability): boolean {
	return can({ role: ctx.membership.role, isOwner: ctx.membership.isOwner }, capability);
}

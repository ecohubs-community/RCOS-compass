import { and, count, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { discussion, objection, post, type Objection } from '../db/schema/discussions.js';
import { registerTenantService } from './registry.js';

/**
 * Dissent, with a state rather than a reaction. UI spec §5.1.
 *
 * The application enforces nobody's threshold — freezing over an open objection
 * is allowed, because the community's own rule decides that, not this software.
 * What it refuses is to let one **disappear**. An objection has a reason, an
 * author, a state, and no delete; resolving it records who resolved it and how.
 *
 * Dissent that evaporates at the moment of recording is how a community ends up
 * arguing about what was agreed.
 */

export const OBJECTION_STATES = ['open', 'withdrawn', 'addressed', 'overruled'] as const;
export type ObjectionState = (typeof OBJECTION_STATES)[number];

/** A proposal in the caller's community, or nothing. */
function proposalInCommunity(db: Db, ctx: Ctx, proposalPostId: string) {
	const found = db
		.select({ post, discussion })
		.from(post)
		.innerJoin(discussion, eq(discussion.id, post.discussionId))
		.where(and(eq(post.id, proposalPostId), eq(discussion.communityId, ctx.community.id)))
		.get();

	if (!found || found.post.kind !== 'proposal') error(404, 'Not found');
	return found;
}

export function getObjection(ctx: Ctx, objectionId: string, options: { db?: Db } = {}): Objection {
	requirePermission(ctx, 'discussion.read');
	const db = options.db ?? getDb();

	const found = db
		.select({ objection })
		.from(objection)
		.innerJoin(post, eq(post.id, objection.proposalPostId))
		.innerJoin(discussion, eq(discussion.id, post.discussionId))
		.where(and(eq(objection.id, objectionId), eq(discussion.communityId, ctx.community.id)))
		.get();

	if (!found) error(404, 'Not found');
	return found.objection;
}

export function raiseObjection(
	ctx: Ctx,
	input: { proposalPostId: string; reason: string },
	options: { db?: Db } = {}
): Objection {
	requirePermission(ctx, 'objection.raise');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	proposalInCommunity(db, ctx, input.proposalPostId);

	const reason = input.reason.trim();
	// A reason is not optional: "I object" with nothing after it cannot be
	// addressed, which makes it impossible to resolve honestly.
	if (!reason) error(400, 'Say what the objection is, so it can be addressed.');

	const id = newId();
	db.insert(objection)
		.values({
			id,
			proposalPostId: input.proposalPostId,
			raisedBy: ctx.user.id,
			reason,
			raisedAt: new Date(ctx.now()),
			state: 'open',
			resolvedBy: null,
			resolvedAt: null,
			resolutionNote: null
		})
		.run();

	return db.select().from(objection).where(eq(objection.id, id)).get()!;
}

/**
 * Move an objection out of `open`.
 *
 * Withdrawing is the objector's own act and needs no permission beyond having
 * raised it. Addressing and overruling are acts of authority — someone is saying
 * the community answered it, or decided to proceed anyway — so they are a
 * steward's, and both record who said so.
 */
export function resolveObjection(
	ctx: Ctx,
	input: { objectionId: string; state: Exclude<ObjectionState, 'open'>; note?: string },
	options: { db?: Db } = {}
): Objection {
	const db = options.db ?? getDb();
	const found = getObjection(ctx, input.objectionId, options);

	if (input.state === 'withdrawn') {
		if (found.raisedBy !== ctx.user.id) {
			error(403, 'Only the person who raised an objection can withdraw it.');
		}
	} else {
		requirePermission(ctx, 'objection.resolve');
	}

	if (found.state !== 'open') error(409, 'That objection has already been resolved.');

	db.update(objection)
		.set({
			state: input.state,
			resolvedBy: ctx.user.id,
			resolvedAt: new Date(ctx.now()),
			resolutionNote: input.note?.trim() || null
		})
		.where(eq(objection.id, input.objectionId))
		.run();

	return db.select().from(objection).where(eq(objection.id, input.objectionId)).get()!;
}

export function listObjections(
	ctx: Ctx,
	proposalPostId: string,
	options: { db?: Db } = {}
): Objection[] {
	requirePermission(ctx, 'discussion.read');
	const db = options.db ?? getDb();
	proposalInCommunity(db, ctx, proposalPostId);

	return db
		.select()
		.from(objection)
		.where(eq(objection.proposalPostId, proposalPostId))
		.orderBy(objection.raisedAt)
		.all();
}

/**
 * How many are still open. The freeze records this on the decision, and the
 * register shows it forever — "frozen with 1 unresolved objection".
 */
export function countUnresolved(db: Db, proposalPostId: string): number {
	const [row] = db
		.select({ n: count() })
		.from(objection)
		.where(and(eq(objection.proposalPostId, proposalPostId), eq(objection.state, 'open')))
		.all();
	return row?.n ?? 0;
}

registerTenantService({ name: 'objections.get', subject: 'objection', call: getObjection });
registerTenantService({ name: 'objections.list', subject: 'proposal', call: listObjections });

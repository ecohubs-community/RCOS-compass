import { and, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { user } from '../db/schema/auth.js';
import { post, proposalMoveRequest, type Discussion, type Post } from '../db/schema/discussions.js';
import { membership } from '../db/schema/tenancy.js';
import { getDiscussion, moveQuestion, writeThreadPost } from './discussions.js';
import { activeHolders, notify } from './notifications.js';
import { ERASED_WITHOUT_COMMUNITY, personLabel } from './person.js';
import { registerTenantService } from './registry.js';

/**
 * A member asking for the question to be moved back to an earlier version.
 * `openspec/changes/provenance-ui` D10, the `discussions` spec.
 *
 * Moving the question is a steward's act, because it decides what everybody is
 * being asked. Asking for it is anybody's — and until this, a member who wanted
 * v3 back had to say so in a message and hope somebody read it. The objection
 * pattern: a post in the thread carries the request, so the community reads it
 * where it reads everything else, and a row carries its state, so it gets an
 * answer. **Asking moves nothing.**
 *
 * Settling when the question moves anyway lives in `discussions.ts`, inside the
 * transaction that moves it.
 */

export type MoveRequestState = (typeof proposalMoveRequest.$inferSelect)['state'];

function openDiscussion(ctx: Ctx, db: Db, discussionId: string): Discussion {
	const found = getDiscussion(ctx, discussionId, { db });
	if (found.status === 'abandoned') error(409, 'This discussion was abandoned.');
	return found;
}

/** A version in this discussion, or a 404 that does not say whose it was. */
function versionIn(db: Db, found: Discussion, postId: string): Post {
	const target = db
		.select()
		.from(post)
		.where(and(eq(post.id, postId), eq(post.discussionId, found.id)))
		.get();
	if (!target || target.kind !== 'proposal') error(404, 'Not found');
	return target;
}

export function requestMove(
	ctx: Ctx,
	input: { discussionId: string; targetProposalPostId: string; reason: string },
	options: { db?: Db } = {}
): typeof proposalMoveRequest.$inferSelect {
	requirePermission(ctx, 'proposal.request_move');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const found = openDiscussion(ctx, db, input.discussionId);
	const target = versionIn(db, found, input.targetProposalPostId);

	if (found.currentProposalPostId === target.id) {
		error(409, `v${target.proposalVersion} is already the version on the table.`);
	}
	const reason = input.reason.trim();
	// The reason is the request: a steward cannot answer "put v3 back" without it.
	if (!reason) error(400, 'Say why v' + target.proposalVersion + ' should be back on the table.');

	const mine = db
		.select({ version: post.proposalVersion })
		.from(proposalMoveRequest)
		.innerJoin(post, eq(post.id, proposalMoveRequest.targetProposalPostId))
		.where(
			and(
				eq(proposalMoveRequest.discussionId, found.id),
				eq(proposalMoveRequest.requestedBy, ctx.user.id),
				eq(proposalMoveRequest.state, 'open')
			)
		)
		.get();
	if (mine) {
		error(
			409,
			`You already asked for v${mine.version} to be put back. Withdraw that request first.`
		);
	}

	return db.transaction((tx) => {
		const inTx = tx as unknown as Db;
		const written = writeThreadPost(ctx, inTx, {
			discussionId: found.id,
			kind: 'move_request',
			subjectPostId: target.id,
			body: reason
		});

		const id = newId();
		tx.insert(proposalMoveRequest)
			.values({
				id,
				communityId: ctx.community.id,
				discussionId: found.id,
				requestedBy: ctx.user.id,
				targetProposalPostId: target.id,
				fromProposalPostId: found.currentProposalPostId,
				postId: written.id,
				state: 'open',
				reason,
				requestedAt: new Date(ctx.now()),
				answeredBy: null,
				answeredAt: null,
				answerNote: null
			})
			.run();

		/**
		 * Everyone who can answer it, by email too: a request nobody hears about is
		 * a message in a thread again. `notify` leaves out the asker — a steward
		 * asking tells the other stewards — and anybody who has left.
		 */
		notify(inTx, ctx, {
			kind: 'proposal.move_requested',
			subjectType: 'discussion',
			subjectId: found.id,
			summary: `A member asked to put v${target.proposalVersion} back in ${found.title}`,
			params: {
				title: found.title,
				actor: ctx.membership.id,
				version: target.proposalVersion ?? 0
			},
			recipients: activeHolders(inTx, ctx.community.id, 'proposal.set_current'),
			mail: true
		});

		return tx.select().from(proposalMoveRequest).where(eq(proposalMoveRequest.id, id)).get()!;
	});
}

function requestInCommunity(ctx: Ctx, db: Db, requestId: string) {
	const found = db
		.select()
		.from(proposalMoveRequest)
		.where(
			and(
				eq(proposalMoveRequest.id, requestId),
				eq(proposalMoveRequest.communityId, ctx.community.id)
			)
		)
		.get();
	if (!found) error(404, 'Not found');
	return found;
}

/**
 * A steward's answer. Granting moves the question exactly as putting the
 * version back does — it *is* that, and the request is settled by the move —
 * in one transaction. Declining moves nothing and needs a note, because "no"
 * with no reason is the answer a member cannot argue with.
 */
export function answerMove(
	ctx: Ctx,
	input: { requestId: string; grant: boolean; note?: string | null },
	options: { db?: Db } = {}
): typeof proposalMoveRequest.$inferSelect {
	requirePermission(ctx, 'proposal.set_current');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const request = requestInCommunity(ctx, db, input.requestId);
	if (request.state !== 'open') error(409, 'That request has already been answered.');
	const found = openDiscussion(ctx, db, request.discussionId);
	const target = versionIn(db, found, request.targetProposalPostId);
	const note = input.note?.trim() || null;

	if (!input.grant && !note) error(400, 'Say why, so the member can answer it.');

	return db.transaction((tx) => {
		const inTx = tx as unknown as Db;
		if (input.grant) {
			// Settles this request as granted, and lapses any asking for another version.
			moveQuestion(inTx, ctx, found, target, note);
			if (note) {
				tx.update(proposalMoveRequest)
					.set({ answerNote: note })
					.where(eq(proposalMoveRequest.id, request.id))
					.run();
			}
		} else {
			tx.update(proposalMoveRequest)
				.set({
					state: 'declined',
					answeredBy: ctx.user.id,
					answeredAt: new Date(ctx.now()),
					answerNote: note
				})
				.where(eq(proposalMoveRequest.id, request.id))
				.run();

			const requester = request.requestedBy
				? tx
						.select({ id: membership.id })
						.from(membership)
						.where(
							and(
								eq(membership.userId, request.requestedBy),
								eq(membership.communityId, ctx.community.id)
							)
						)
						.get()
				: undefined;
			if (requester) {
				notify(inTx, ctx, {
					kind: 'proposal.move_answered',
					subjectType: 'discussion',
					subjectId: found.id,
					summary: `Your request to put v${target.proposalVersion} back was declined`,
					params: { title: found.title, version: target.proposalVersion ?? 0, outcome: 'declined' },
					recipients: [requester.id]
				});
			}
		}
		return tx
			.select()
			.from(proposalMoveRequest)
			.where(eq(proposalMoveRequest.id, request.id))
			.get()!;
	});
}

/** The requester taking it back. Theirs alone, like withdrawing an objection. */
export function withdrawMove(
	ctx: Ctx,
	input: { requestId: string },
	options: { db?: Db } = {}
): typeof proposalMoveRequest.$inferSelect {
	requirePermission(ctx, 'discussion.read');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const request = requestInCommunity(ctx, db, input.requestId);
	if (request.requestedBy !== ctx.user.id) {
		error(403, 'Only the person who asked can withdraw the request.');
	}
	if (request.state !== 'open') error(409, 'That request has already been answered.');

	db.update(proposalMoveRequest)
		.set({ state: 'withdrawn', answeredBy: ctx.user.id, answeredAt: new Date(ctx.now()) })
		.where(eq(proposalMoveRequest.id, request.id))
		.run();
	return db.select().from(proposalMoveRequest).where(eq(proposalMoveRequest.id, request.id)).get()!;
}

export type MoveRequestView = {
	id: string;
	postId: string;
	state: MoveRequestState;
	targetProposalPostId: string;
	targetVersion: number | null;
	fromVersion: number | null;
	reason: string;
	requestedBy: string;
	requestedAt: number;
	answeredBy: string | null;
	answeredAt: number | null;
	answerNote: string | null;
	/** The reader asked, so they may withdraw it. */
	mine: boolean;
};

/**
 * Every request in a thread, with names through `personLabel` (`docs/03` §10)
 * and the versions as numbers, for the thread to draw each `move_request` post.
 */
export function listMoveRequests(
	ctx: Ctx,
	discussionId: string,
	options: { db?: Db } = {}
): MoveRequestView[] {
	requirePermission(ctx, 'discussion.read');
	const db = options.db ?? getDb();
	const found = getDiscussion(ctx, discussionId, { db });

	const rows = db
		.select()
		.from(proposalMoveRequest)
		.where(eq(proposalMoveRequest.discussionId, found.id))
		.orderBy(proposalMoveRequest.requestedAt)
		.all();
	if (rows.length === 0) return [];

	const versions = new Map(
		db
			.select({ id: post.id, version: post.proposalVersion })
			.from(post)
			.where(and(eq(post.discussionId, found.id), eq(post.kind, 'proposal')))
			.all()
			.map((row) => [row.id, row.version])
	);
	const people = [
		...new Set(rows.flatMap((row) => [row.requestedBy, row.answeredBy]).filter(Boolean))
	] as string[];
	const labels = new Map(
		people.length === 0
			? []
			: db
					.select({
						id: user.id,
						name: user.name,
						erasedAt: user.erasedAt,
						displayName: membership.displayName,
						seq: membership.seq
					})
					.from(user)
					.leftJoin(
						membership,
						and(eq(membership.userId, user.id), eq(membership.communityId, ctx.community.id))
					)
					.where(inArray(user.id, people))
					.all()
					.map((row) => [row.id, personLabel(row)])
	);
	const label = (id: string | null) => (id && labels.get(id)) || ERASED_WITHOUT_COMMUNITY;

	return rows.map((row) => ({
		id: row.id,
		postId: row.postId,
		state: row.state,
		targetProposalPostId: row.targetProposalPostId,
		targetVersion: versions.get(row.targetProposalPostId) ?? null,
		fromVersion: row.fromProposalPostId ? (versions.get(row.fromProposalPostId) ?? null) : null,
		reason: row.reason,
		requestedBy: label(row.requestedBy),
		requestedAt: row.requestedAt.getTime(),
		answeredBy: row.answeredBy ? label(row.answeredBy) : null,
		answeredAt: row.answeredAt?.getTime() ?? null,
		answerNote: row.answerNote,
		mine: row.requestedBy === ctx.user.id
	}));
}

registerTenantService({ name: 'moveRequests.list', subject: 'discussion', call: listMoveRequests });
registerTenantService({
	name: 'moveRequests.request',
	subject: 'proposal',
	call: (ctx, subjectId) =>
		requestMove(ctx, { discussionId: subjectId, targetProposalPostId: subjectId, reason: 'x' })
});
registerTenantService({
	name: 'moveRequests.answer',
	subject: 'moveRequest',
	call: (ctx, subjectId) => answerMove(ctx, { requestId: subjectId, grant: true })
});
registerTenantService({
	name: 'moveRequests.withdraw',
	subject: 'moveRequest',
	call: (ctx, subjectId) => withdrawMove(ctx, { requestId: subjectId })
});

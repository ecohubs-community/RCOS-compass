import { and, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { definition } from '../db/schema/definitions.js';
import { discussion, post, type Discussion, type Post } from '../db/schema/discussions.js';
import { registerTenantService } from './registry.js';

/**
 * How a community gets from a gap to something worth freezing.
 * UI spec §5.1, openspec core-loop `discussions`.
 *
 * Two things this module is careful about.
 *
 * **A proposal is a post, not a table.** It carries its own version, author and
 * actions, and it is the only thing a freeze can be based on — but it belongs to
 * the thread it was written in, and a second table would be a second thing to
 * keep in step with that thread.
 *
 * **Taking it offline is a path, not an escape hatch.** Most real decisions in
 * these communities are made in a room. The application's job is to be where the
 * room's outcome lands, and the offline route reaches the same freeze with the
 * same required fields — it differs only in recording that it happened offline,
 * so a reader can tell.
 */

/** Bring a discussion into the caller's community, or answer as if it is not there. */
export function getDiscussion(
	ctx: Ctx,
	discussionId: string,
	options: { db?: Db } = {}
): Discussion {
	requirePermission(ctx, 'discussion.read');
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(discussion)
		.where(and(eq(discussion.id, discussionId), eq(discussion.communityId, ctx.community.id)))
		.get();

	if (!found) error(404, 'Not found');
	return found;
}

export type OpenDiscussion = {
	title: string;
	/** Exactly one: a clause with no definition yet, or an existing definition. */
	about: { kind: 'clause'; clauseKey: string } | { kind: 'definition'; definitionId: string };
	/** `offline` marks a thread opened to record a decision already taken. */
	origin?: 'clause' | 'offline';
};

export function openDiscussion(
	ctx: Ctx,
	input: OpenDiscussion,
	options: { db?: Db } = {}
): Discussion {
	requirePermission(ctx, 'discussion.create');
	const db = options.db ?? getDb();
	const now = ctx.now();

	const title = input.title.trim();
	if (!title) error(400, 'Give the discussion a title.');

	if (input.about.kind === 'definition') {
		// The definition must be this community's; otherwise the thread would be a
		// way to learn that another community's definition exists.
		const subject = db
			.select()
			.from(definition)
			.where(
				and(
					eq(definition.id, input.about.definitionId),
					eq(definition.communityId, ctx.community.id)
				)
			)
			.get();
		if (!subject) error(404, 'Not found');
	}

	const row = {
		id: newId(),
		communityId: ctx.community.id,
		definitionId: input.about.kind === 'definition' ? input.about.definitionId : null,
		clauseKey: input.about.kind === 'clause' ? input.about.clauseKey : null,
		title,
		status: 'open' as const,
		origin: input.origin ?? ('clause' as const),
		openedBy: ctx.user.id,
		openedAt: new Date(now),
		lastActivityAt: new Date(now),
		frozenDecisionId: null
	};

	db.insert(discussion).values(row).run();
	return db.select().from(discussion).where(eq(discussion.id, row.id)).get()!;
}

/** Newest activity first — the dashboard's "stalled 12 days" reads this order. */
export function listDiscussions(ctx: Ctx, options: { db?: Db } = {}): Discussion[] {
	requirePermission(ctx, 'discussion.read');
	const db = options.db ?? getDb();
	return db
		.select()
		.from(discussion)
		.where(eq(discussion.communityId, ctx.community.id))
		.orderBy(desc(discussion.lastActivityAt))
		.all();
}

export function listPosts(ctx: Ctx, discussionId: string, options: { db?: Db } = {}): Post[] {
	getDiscussion(ctx, discussionId, options);
	const db = options.db ?? getDb();
	return db
		.select()
		.from(post)
		.where(eq(post.discussionId, discussionId))
		.orderBy(post.createdAt)
		.all();
}

/** A thread that has been frozen or abandoned takes no more writes. */
function requireWritable(found: Discussion): void {
	if (found.status === 'frozen') {
		error(409, 'This discussion has been decided. Start a new one to change it.');
	}
	if (found.status === 'abandoned') error(409, 'This discussion was abandoned.');
}

export function addMessage(
	ctx: Ctx,
	input: { discussionId: string; body: string },
	options: { db?: Db } = {}
): Post {
	requirePermission(ctx, 'discussion.comment');
	const found = getDiscussion(ctx, input.discussionId, options);
	requireWritable(found);

	const body = input.body.trim();
	if (!body) error(400, 'Write something first.');

	return writePost(ctx, options, {
		discussionId: input.discussionId,
		body,
		kind: 'message',
		proposalVersion: null
	});
}

/**
 * A proposal, numbered within its thread.
 *
 * Every member may write one — proposing is the whole of what a member does
 * (docs/04-security.md §1). Recording is what a steward does, and that is the
 * freeze.
 */
export function addProposal(
	ctx: Ctx,
	input: { discussionId: string; body: string },
	options: { db?: Db } = {}
): Post {
	requirePermission(ctx, 'proposal.create');
	const found = getDiscussion(ctx, input.discussionId, options);
	requireWritable(found);

	const body = input.body.trim();
	if (!body) error(400, 'A proposal needs some text.');

	const db = options.db ?? getDb();
	const previous = db
		.select()
		.from(post)
		.where(and(eq(post.discussionId, input.discussionId), eq(post.kind, 'proposal')))
		.orderBy(desc(post.proposalVersion))
		.get();

	return writePost(ctx, options, {
		discussionId: input.discussionId,
		body,
		kind: 'proposal',
		// v1, v2, v3 … and every earlier one stays readable.
		proposalVersion: (previous?.proposalVersion ?? 0) + 1
	});
}

/**
 * Record that the room decided it.
 *
 * The summary says what happened; the proposal is what came out of it, and it is
 * an ordinary proposal — so the freeze that follows asks for exactly the same
 * things it asks for online.
 */
export function takeOffline(
	ctx: Ctx,
	input: { discussionId: string; summary: string; proposal: string },
	options: { db?: Db } = {}
): { summary: Post; proposal: Post } {
	requirePermission(ctx, 'discussion.comment');
	const found = getDiscussion(ctx, input.discussionId, options);
	requireWritable(found);

	const summary = input.summary.trim();
	const proposalText = input.proposal.trim();
	if (!summary) error(400, 'Say what happened in the meeting.');
	if (!proposalText) error(400, 'Record the proposal the meeting produced.');

	const db = options.db ?? getDb();

	return db.transaction((tx) => {
		const withTx = { db: tx as unknown as Db };

		const summaryPost = writePost(ctx, withTx, {
			discussionId: input.discussionId,
			body: summary,
			kind: 'offline_summary',
			proposalVersion: null
		});

		const previous = tx
			.select()
			.from(post)
			.where(and(eq(post.discussionId, input.discussionId), eq(post.kind, 'proposal')))
			.orderBy(desc(post.proposalVersion))
			.get();

		const proposalPost = writePost(ctx, withTx, {
			discussionId: input.discussionId,
			body: proposalText,
			kind: 'proposal',
			proposalVersion: (previous?.proposalVersion ?? 0) + 1
		});

		tx.update(discussion)
			.set({ status: 'decided_offline', origin: 'offline' })
			.where(eq(discussion.id, input.discussionId))
			.run();

		return { summary: summaryPost, proposal: proposalPost };
	});
}

function writePost(
	ctx: Ctx,
	options: { db?: Db },
	values: {
		discussionId: string;
		body: string;
		kind: 'message' | 'proposal' | 'offline_summary';
		proposalVersion: number | null;
	}
): Post {
	const db = options.db ?? getDb();
	const now = ctx.now();
	const id = newId();

	db.insert(post)
		.values({
			id,
			discussionId: values.discussionId,
			authorId: ctx.user.id,
			body: values.body,
			kind: values.kind,
			proposalVersion: values.proposalVersion,
			frozenDecisionId: null,
			createdAt: new Date(now),
			editedAt: null
		})
		.run();

	// Every post is activity: this is what "stalled 12 days" measures.
	db.update(discussion)
		.set({ lastActivityAt: new Date(now) })
		.where(eq(discussion.id, values.discussionId))
		.run();

	return db.select().from(post).where(eq(post.id, id)).get()!;
}

/** The latest proposal in a thread, or null when nobody has written one. */
export function latestProposal(
	ctx: Ctx,
	discussionId: string,
	options: { db?: Db } = {}
): Post | null {
	getDiscussion(ctx, discussionId, options);
	const db = options.db ?? getDb();
	return (
		db
			.select()
			.from(post)
			.where(and(eq(post.discussionId, discussionId), eq(post.kind, 'proposal')))
			.orderBy(desc(post.proposalVersion))
			.get() ?? null
	);
}

/**
 * The proposal a freeze would adopt.
 *
 * Refuses rather than returning null, because the caller is about to record a
 * decision and "there is nothing to record" is worth saying plainly. Freezing is
 * built in group 5; this is the question it asks.
 */
export function proposalToFreeze(ctx: Ctx, discussionId: string, options: { db?: Db } = {}): Post {
	const found = getDiscussion(ctx, discussionId, options);
	if (found.status === 'frozen') {
		error(409, 'This discussion has already been decided.');
	}

	const proposal = latestProposal(ctx, discussionId, options);
	if (!proposal) {
		error(409, 'There is no proposal to record yet. Write one first, then freeze it.');
	}
	if (proposal.frozenDecisionId) {
		error(409, 'That proposal has already been recorded as a decision.');
	}
	return proposal;
}

registerTenantService({ name: 'discussions.get', subject: 'discussion', call: getDiscussion });
registerTenantService({ name: 'discussions.posts', subject: 'discussion', call: listPosts });
registerTenantService({
	name: 'discussions.latestProposal',
	subject: 'discussion',
	call: latestProposal
});

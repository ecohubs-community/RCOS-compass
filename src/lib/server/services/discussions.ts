import { and, asc, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { definition } from '../db/schema/definitions.js';
import {
	consentEligible,
	consentResponse,
	consentRound,
	discussion,
	objection,
	post,
	type Discussion,
	type Objection,
	type Post
} from '../db/schema/discussions.js';
import { user } from '../db/schema/auth.js';
import { membership } from '../db/schema/tenancy.js';
import { initialsOf, membershipLabel, personLabel } from './person.js';
import { lint } from '../linter/index.js';
import { adoptedElsewhere } from './definitions.js';
import { activeStandardView } from './completeness.js';
import { mentionedSeqs } from '../markdown.js';
import { discussionParticipants, mentionedMembers, notify, notifyReply } from './notifications.js';
import { indexDiscussion } from './search.js';
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
	/**
	 * A clause with no definition yet, an existing definition, or neither.
	 *
	 * `open_question` is a real thread about nothing in the standard — the field
	 * on the form says "Clause (optional)" and has to mean it. It was previously
	 * faked with the clause key `'unassigned'`, which produced a thread that
	 * could be discussed, proposed on, and never frozen.
	 */
	about:
		| { kind: 'clause'; clauseKey: string }
		| { kind: 'definition'; definitionId: string }
		| { kind: 'open_question' };
	/** `offline` marks a thread opened to record a decision already taken. */
	origin?: 'clause' | 'offline';
};

export function openDiscussion(
	ctx: Ctx,
	input: OpenDiscussion,
	options: { db?: Db } = {}
): Discussion {
	requirePermission(ctx, 'discussion.create');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();

	const title = input.title.trim();
	if (!title) error(400, 'Give the discussion a title.');

	/**
	 * A clause names itself two ways, and members see the second.
	 *
	 * The standard browser shows references — "2.1.1" — so that is what gets
	 * typed into "Clause (optional)", while the stable key is
	 * `l0.purpose-definition.1`. Both are accepted and **the key is stored**:
	 * everything downstream matches on the key, and a thread filed under the
	 * reference was invisible to the dashboard, which then went on inviting
	 * people to start the discussion that already existed.
	 */
	let clauseKey: string | null = null;
	if (input.about.kind === 'clause') {
		const standard = activeStandardView(db, ctx);
		if (!standard) error(409, 'This community has not adopted a standard yet.');

		const typed = input.about.clauseKey;
		// Refused now, plainly, rather than at the freeze — where it surfaces as
		// "that clause is not part of the standard" on a thread somebody has
		// already spent a week on.
		const clause = standard.view.clause(typed) ?? standard.view.clauseByRef(typed);
		if (!clause) {
			error(400, `There is no clause ${typed} in the standard this community adopted.`);
		}
		clauseKey = clause.key;
	}

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
		clauseKey,
		title,
		status: 'open' as const,
		origin: input.origin ?? ('clause' as const),
		openedBy: ctx.user.id,
		openedAt: new Date(now),
		lastActivityAt: new Date(now),
		frozenDecisionId: null
	};

	// A transaction for two writes, because a thread that exists and cannot be
	// found is the failure this indexing strategy exists to prevent, and half of
	// it succeeding is worse than neither.
	db.transaction((tx) => {
		tx.insert(discussion).values(row).run();
		indexDiscussion(tx as unknown as Db, ctx.community.id, row.id);
	});
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

/**
 * A thread as the list draws it. Design: `design_files/platform/` screen 10.
 *
 * Everything on one row, and every part of it derived rather than stored:
 *
 * - **`inVote` is an open round, not `discussion.status`.** That column has an
 *   `in_vote` value and nothing in the product has ever written it — a round
 *   opens on the first response and closes on the last, none of which touches
 *   the thread. A filter reading the column would have counted one thread in
 *   vote for every thread ever put in vote by hand, which is none of them.
 * - **`waitingOnMe` is per reader.** Eligible for an open round, and has not
 *   answered it. It is the one number on the screen that is not the same for
 *   everybody, which is exactly why the design leads with it.
 * - **`people` is who has spoken**, in the order they first did, so the column
 *   reads as a conversation rather than as a membership list.
 *
 * Three queries for the whole list rather than three per row: a community with
 * ninety threads is ordinary, and this screen is the one they open first.
 */
export type DiscussionSummary = {
	id: string;
	title: string;
	status: Discussion['status'];
	origin: Discussion['origin'];
	clauseKey: string | null;
	openedAt: number;
	lastActivityAt: number;
	/** Everyone who has posted, first to speak first. */
	people: PostAuthor[];
	/** Who moved it last, and how — so the row says what happened, not just when. */
	last: { author: PostAuthor; kind: Post['kind'] } | null;
	/** The newest proposal's number, or null while the thread is still talking. */
	version: number | null;
	/** A round is open on the text on the table. */
	inVote: boolean;
	/** …and this reader is eligible for it and has not answered. */
	waitingOnMe: boolean;
};

export function listDiscussionSummaries(ctx: Ctx, options: { db?: Db } = {}): DiscussionSummary[] {
	requirePermission(ctx, 'discussion.read');
	const db = options.db ?? getDb();
	const threads = listDiscussions(ctx, { db });
	if (threads.length === 0) return [];

	const ids = threads.map((thread) => thread.id);

	/**
	 * Every post in every listed thread, oldest first.
	 *
	 * Labels go through `personLabel` like every other surface (`docs/03` §10) —
	 * a member who has been erased still spoke, and the row still says so under
	 * their community's former-member label.
	 */
	const posts = db
		.select({
			discussionId: post.discussionId,
			authorId: post.authorId,
			kind: post.kind,
			proposalVersion: post.proposalVersion,
			name: user.name,
			erasedAt: user.erasedAt,
			displayName: membership.displayName,
			seq: membership.seq
		})
		.from(post)
		.leftJoin(user, eq(user.id, post.authorId))
		.leftJoin(
			membership,
			and(eq(membership.userId, post.authorId), eq(membership.communityId, ctx.community.id))
		)
		.where(inArray(post.discussionId, ids))
		.orderBy(asc(post.createdAt))
		.all();

	const people = new Map<string, Map<string, PostAuthor>>();
	const last = new Map<string, { author: PostAuthor; kind: Post['kind'] }>();
	const version = new Map<string, number>();

	for (const row of posts) {
		const label = personLabel({
			erasedAt: row.erasedAt ?? null,
			name: row.name,
			displayName: row.displayName,
			seq: row.seq
		});
		const author = { label, initials: initialsOf(label) };
		/**
		 * A Map keyed by the author, so somebody who wrote nine times appears
		 * once and keeps the position of their first post.
		 *
		 * By id and not by label: two members can share a display name, and
		 * collapsing them would quietly report a conversation between two people
		 * as a conversation with one. A post whose author is gone has no id to
		 * key on, so those fall back to the label they are shown under.
		 */
		const key = row.authorId ?? label;
		const seen = people.get(row.discussionId) ?? new Map<string, PostAuthor>();
		if (!seen.has(key)) seen.set(key, author);
		people.set(row.discussionId, seen);
		last.set(row.discussionId, { author, kind: row.kind });
		if (row.kind === 'proposal' && row.proposalVersion !== null) {
			version.set(row.discussionId, row.proposalVersion);
		}
	}

	/**
	 * The rounds still taking answers.
	 *
	 * A round past its deadline is excluded here rather than closed: closing is a
	 * write, and a list is a read. `closeIfDue` in the round service does the
	 * write on the next touch, and the hourly sweep does it if nobody touches it
	 * — so the only thing this has to avoid is telling somebody a round is
	 * waiting on them when its deadline has gone.
	 */
	const now = ctx.now();
	const openRounds = db
		.select({
			discussionId: post.discussionId,
			eligible: consentEligible.membershipId,
			answered: consentResponse.membershipId
		})
		.from(consentRound)
		.innerJoin(post, eq(post.id, consentRound.proposalPostId))
		.leftJoin(
			consentEligible,
			and(
				eq(consentEligible.roundId, consentRound.id),
				eq(consentEligible.membershipId, ctx.membership.id)
			)
		)
		.leftJoin(
			consentResponse,
			and(
				eq(consentResponse.roundId, consentRound.id),
				eq(consentResponse.membershipId, ctx.membership.id)
			)
		)
		.where(
			and(
				eq(consentRound.communityId, ctx.community.id),
				eq(consentRound.status, 'open'),
				inArray(post.discussionId, ids),
				or(isNull(consentRound.closesAt), gt(consentRound.closesAt, new Date(now)))
			)
		)
		.all();

	const inVote = new Set(openRounds.map((row) => row.discussionId));
	const waiting = new Set(
		openRounds
			.filter((row) => row.eligible !== null && row.answered === null)
			.map((row) => row.discussionId)
	);

	return threads.map((thread) => ({
		id: thread.id,
		title: thread.title,
		status: thread.status,
		origin: thread.origin,
		clauseKey: thread.clauseKey,
		openedAt: thread.openedAt.getTime(),
		lastActivityAt: thread.lastActivityAt.getTime(),
		people: [...(people.get(thread.id)?.values() ?? [])],
		last: last.get(thread.id) ?? null,
		version: version.get(thread.id) ?? null,
		inVote: inVote.has(thread.id),
		waitingOnMe: waiting.has(thread.id)
	}));
}

export type PostAuthor = { label: string; initials: string };

/**
 * A post as the thread shows it: who wrote it, which version a response or
 * event is about, and — for a post that raised an objection — where that
 * objection stands now.
 */
export type ThreadPost = Post & {
	author: PostAuthor;
	subjectVersion: number | null;
	objectionState: Objection['state'] | null;
};

/**
 * The thread, with a name against everything in it.
 *
 * Names go through `personLabel` like every other surface (`docs/03` §10), and
 * the membership is joined in for the `seq` that a former member's label needs —
 * the label is community-local, so it cannot be produced from the account alone.
 */
export function listPostsWithAuthors(
	ctx: Ctx,
	discussionId: string,
	options: { db?: Db } = {}
): ThreadPost[] {
	getDiscussion(ctx, discussionId, options);
	const db = options.db ?? getDb();

	const rows = db
		.select({
			post,
			name: user.name,
			erasedAt: user.erasedAt,
			displayName: membership.displayName,
			seq: membership.seq
		})
		.from(post)
		.leftJoin(user, eq(user.id, post.authorId))
		.leftJoin(
			membership,
			and(eq(membership.userId, post.authorId), eq(membership.communityId, ctx.community.id))
		)
		.where(eq(post.discussionId, discussionId))
		.orderBy(post.createdAt)
		.all();

	/**
	 * Where each objection said in this thread stands now. Read at view time,
	 * because an objection is addressed or withdrawn long after the post that
	 * raised it, and the thread must not keep calling it open.
	 */
	const postIds = rows.map((row) => row.post.id);
	const objectionState = new Map(
		postIds.length === 0
			? []
			: db
					.select({ postId: objection.postId, state: objection.state })
					.from(objection)
					.where(inArray(objection.postId, postIds))
					.all()
					.map((row) => [row.postId!, row.state])
	);
	const versionOf = new Map(
		rows
			.filter((row) => row.post.kind === 'proposal')
			.map((row) => [row.post.id, row.post.proposalVersion])
	);

	return rows.map((row) => {
		const label = personLabel({
			erasedAt: row.erasedAt ?? null,
			name: row.name,
			displayName: row.displayName,
			seq: row.seq
		});
		return {
			...row.post,
			author: { label, initials: initialsOf(label) },
			subjectVersion: row.post.subjectPostId
				? (versionOf.get(row.post.subjectPostId) ?? null)
				: null,
			objectionState: objectionState.get(row.post.id) ?? null
		};
	});
}

export type MentionDirectory = {
	/** Who each number written in the thread names, by `personLabel`. */
	labels: Record<number, string>;
	/** Everyone who may be mentioned: current members, for the composer. */
	members: { token: string; label: string }[];
};

/**
 * Names for the mentions in a thread, and the members a composer may offer.
 *
 * A number is named whether its membership is current or ended, so a mention
 * of somebody who has left or been erased reads as their label rather than
 * reverting to digits; a number that was never anyone's here stays as written.
 */
export function mentionDirectory(
	ctx: Ctx,
	bodies: string[],
	options: { db?: Db } = {}
): MentionDirectory {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const seqs = [...new Set(bodies.flatMap((body) => mentionedSeqs(body)))];
	const person = {
		seq: membership.seq,
		endedAt: membership.endedAt,
		displayName: membership.displayName,
		name: user.name,
		erasedAt: user.erasedAt
	};

	const labels: Record<number, string> = {};
	if (seqs.length > 0) {
		for (const row of db
			.select(person)
			.from(membership)
			.innerJoin(user, eq(user.id, membership.userId))
			.where(and(eq(membership.communityId, ctx.community.id), inArray(membership.seq, seqs)))
			.all()) {
			labels[row.seq] = personLabel(row);
		}
	}

	const members = db
		.select(person)
		.from(membership)
		.innerJoin(user, eq(user.id, membership.userId))
		.where(and(eq(membership.communityId, ctx.community.id), isNull(membership.endedAt)))
		.orderBy(asc(membership.seq))
		.all()
		.map((row) => ({ token: `@${membershipLabel(row.seq)}`, label: personLabel(row) }));

	return { labels, members };
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

/**
 * A thread that has been abandoned takes no more writes. A decided one does.
 *
 * `frozen` used to end a discussion, which made sense while a thread produced at
 * most one decision. It cannot survive a rail where a version is chosen: v5,
 * written months after v3 was adopted, has to live somewhere, and the only
 * honest place is the thread that produced v3 — the argument is the same
 * argument. What is spent is the proposal, not the discussion, and that guard
 * lives on the proposal (`proposalToFreeze`).
 *
 * Abandoning is now the only act that ends a thread.
 */
function requireWritable(found: Discussion): void {
	if (found.status === 'abandoned') error(409, 'This discussion was abandoned.');
}

export function addMessage(
	ctx: Ctx,
	input: { discussionId: string; body: string },
	options: { db?: Db } = {}
): Post {
	requirePermission(ctx, 'discussion.comment');
	requireWritableCommunity(ctx);
	const found = getDiscussion(ctx, input.discussionId, options);
	requireWritable(found);

	const body = input.body.trim();
	if (!body) error(400, 'Write something first.');

	const db = options.db ?? getDb();
	// The reply and who it tells, or neither.
	return db.transaction((tx) => {
		const written = writePost(
			ctx,
			{ db: tx as unknown as Db },
			{ discussionId: input.discussionId, body, kind: 'message', proposalVersion: null }
		);
		tellThread(tx as unknown as Db, ctx, found, written);
		return written;
	});
}

/**
 * Who a new post tells, written in the post's own transaction.
 *
 * Anyone it mentions hears that, and nothing else about this post. Everyone
 * else who has written in the thread hears of a reply — collapsed — or of a
 * proposal, which is its own kind, because a new text on the table is not one
 * more message.
 */
function tellThread(db: Db, ctx: Ctx, found: Discussion, written: Post): void {
	const mentioned = mentionedMembers(db, ctx, mentionedSeqs(written.body));
	notify(db, ctx, {
		kind: 'discussion.mention',
		subjectType: 'discussion',
		subjectId: found.id,
		summary: `You were mentioned in ${found.title}`,
		params: { title: found.title, actor: ctx.membership.id },
		recipients: mentioned
	});

	const told = new Set(mentioned);
	const participants = discussionParticipants(db, ctx.community.id, found.id).filter(
		(id) => !told.has(id)
	);
	if (written.kind === 'proposal') {
		// The people who have written in this thread, not everyone: a notification
		// everybody gets is a notification nobody reads.
		notify(db, ctx, {
			kind: 'proposal.posted',
			subjectType: 'discussion',
			subjectId: found.id,
			summary: found.title,
			params: { title: found.title },
			recipients: participants
		});
	} else {
		notifyReply(db, ctx, { discussionId: found.id, title: found.title, recipients: participants });
	}
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
	input: { discussionId: string; body: string; revisionNote?: string | null },
	options: { db?: Db } = {}
): Post {
	requirePermission(ctx, 'proposal.create');
	requireWritableCommunity(ctx);
	const found = getDiscussion(ctx, input.discussionId, options);
	requireWritable(found);

	const body = input.body.trim();
	if (!body) error(400, 'A proposal needs some text.');

	const db = options.db ?? getDb();

	/**
	 * The new version and the closure of the old round, or neither.
	 *
	 * Two commits would leave a window where v3 and v4 both look like the text on
	 * the table, and a response landing in it would be counted into a tally for a
	 * version nobody is being asked about any more.
	 */
	return db.transaction((tx) => {
		const written = writeProposal(ctx, tx as unknown as Db, found, {
			body,
			revisionNote: input.revisionNote
		});
		// Inside, so a proposal that rolls back told nobody about itself.
		tellThread(tx as unknown as Db, ctx, found, written);
		return written;
	});
}

/**
 * Write the next version, inside a transaction the caller owns.
 *
 * Factored out because `takeOffline` already runs in one and SQLite has no
 * nested transactions — and because closing the previous version's round has to
 * happen in the same commit either way.
 */
function writeProposal(
	ctx: Ctx,
	tx: Db,
	found: Discussion,
	values: { body: string; revisionNote?: string | null }
): Post {
	const previous = tx
		.select()
		.from(post)
		.where(and(eq(post.discussionId, found.id), eq(post.kind, 'proposal')))
		.orderBy(desc(post.proposalVersion))
		.get();

	const written = writePost(
		ctx,
		{ db: tx },
		{
			discussionId: found.id,
			body: values.body,
			kind: 'proposal',
			// v1, v2, v3 … and every earlier one stays readable.
			proposalVersion: (previous?.proposalVersion ?? 0) + 1,
			// Only a revision has something to have changed.
			revisionNote: previous ? values.revisionNote?.trim() || null : null,
			/**
			 * Linted once, here, and stored with the version.
			 *
			 * On write rather than on read: a rail that stays blank until somebody
			 * thinks to press a button is a rail people learn to ignore, and
			 * `docs/11` §1's rule is that a result is never computed when a page is
			 * *read* — a write is not a read. Each version keeps the result that
			 * judged its own words, so a reader a year later sees what the community
			 * was actually told.
			 *
			 * Judged against what this community has already made binding, not
			 * against the text alone: without that list the only clutter finding
			 * that could ever fire was the generic "would anything change if you
			 * deleted this?", and the useful one — "this is already binding in
			 * *Member Obligations*" — was unreachable. No `plainLanguage`: a
			 * proposal has no such field, and `undefined` is how the linter is
			 * told so (see `LintInput`).
			 */
			linterResult: lint({
				body: values.body,
				locale: ctx.community.locale,
				adoptedElsewhere: adoptedElsewhere(tx, ctx.community.id)
			})
		}
	);

	/**
	 * The question moves to the version just written.
	 *
	 * In the same transaction as the round it supersedes, because the column and
	 * the round are two statements about one fact: which text the community is
	 * being asked about. A commit that carried one and not the other would leave
	 * a thread whose open round is on a version nothing can answer.
	 */
	tx.update(discussion)
		.set({ currentProposalPostId: written.id })
		.where(eq(discussion.id, found.id))
		.run();

	/**
	 * The round on the version that was the question, closed as superseded.
	 *
	 * Not cancelled: nobody cancelled it, the text it was about stopped being the
	 * text on the table. Its responses stay exactly where they are — they are what
	 * that version was told, they are what a freeze of that version should quote,
	 * and they are not consents to these new words.
	 *
	 * The round on the version that *was the question*, which is not always the
	 * version before this one: a steward may have moved the question back to v3
	 * while v4 existed, and writing v5 then supersedes v3's round, not v4's.
	 */
	if (found.currentProposalPostId) {
		tx.update(consentRound)
			.set({
				status: 'superseded',
				closedAt: new Date(ctx.now()),
				supersededByPostId: written.id
			})
			.where(
				and(
					eq(consentRound.proposalPostId, found.currentProposalPostId),
					eq(consentRound.status, 'open')
				)
			)
			.run();
	}

	/**
	 * Open again: there is a new question on the table.
	 *
	 * A thread that produced a decision and then produced a new version is not
	 * decided any more — it is being argued about again, and the dashboard's
	 * stalled arithmetic and the discussion list both read this.
	 */
	if (found.status === 'frozen' || found.status === 'decided_offline') {
		tx.update(discussion).set({ status: 'open' }).where(eq(discussion.id, found.id)).run();
	}

	/**
	 * The version now in flight on the definition this thread is about.
	 *
	 * Written for the first time here. The column has always existed and has only
	 * ever been set to null, which was harmless while a freeze ended the thread —
	 * now that a thread can produce v5 months after v3 was decided, "the proposal
	 * currently in flight" is a question with a real answer.
	 */
	if (found.definitionId) {
		tx.update(definition)
			.set({ openProposalId: written.id })
			.where(eq(definition.id, found.definitionId))
			.run();
	}

	return written;
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
	requireWritableCommunity(ctx);
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

		const proposalPost = writeProposal(ctx, withTx.db, found, { body: proposalText });

		tx.update(discussion)
			.set({ status: 'decided_offline', origin: 'offline' })
			.where(eq(discussion.id, input.discussionId))
			.run();

		return { summary: summaryPost, proposal: proposalPost };
	});
}

/**
 * A post written by something other than the composer.
 *
 * The reason somebody gave with their vote is a thing they said, so it belongs
 * in the thread with everything else they said rather than in a column the
 * conversation cannot see. Exported so the voting provider can write one without
 * reaching into `post` itself — the permission that allowed the vote is the
 * permission that allows this, and it has already been checked by the caller.
 *
 * Always a `response` or an `event`, never a `message`: a post nobody typed
 * into the reply box has to say what it is, or the thread shows a vote and a
 * reply as the same thing.
 */
export function writeThreadPost(
	ctx: Ctx,
	db: Db,
	values: { discussionId: string; body: string; subjectPostId: string } & (
		| { kind: 'response'; responseValue: 'consent' | 'objection' | 'abstain' }
		| { kind: 'event' }
	)
): Post {
	return writePost(
		ctx,
		{ db },
		{
			discussionId: values.discussionId,
			body: values.body,
			kind: values.kind,
			proposalVersion: null,
			revisionNote: null,
			responseValue: values.kind === 'response' ? values.responseValue : null,
			subjectPostId: values.subjectPostId
		}
	);
}

function writePost(
	ctx: Ctx,
	options: { db?: Db },
	values: {
		discussionId: string;
		body: string;
		kind: Post['kind'];
		proposalVersion: number | null;
		revisionNote?: string | null;
		linterResult?: unknown;
		responseValue?: Post['responseValue'];
		subjectPostId?: string | null;
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
			revisionNote: values.revisionNote ?? null,
			linterResult: values.linterResult ?? null,
			responseValue: values.responseValue ?? null,
			subjectPostId: values.subjectPostId ?? null,
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
 * A superseded round, brought back because the question came back to it.
 *
 * Here rather than in `voting/consent-round.ts` for the reason the seam test in
 * `tests/integration/consent.test.ts` enforces: nothing outside `voting/` may
 * import the built-in provider, or a second provider stops being a one-module
 * change. Closing a round when a version is written already reaches into
 * `consent_round` from this file, because closing it is part of writing the
 * version rather than part of voting — and moving the question back is that
 * same act, backwards.
 *
 * **This never refuses the move.** It reports what happened to the round, and
 * the caller says so. An earlier draft refused a lapsed deadline with "ask the
 * question again as a new round", which named an act the product does not have:
 * a version holds at most one round (`roundFor` reads one row), and the form
 * that opened a round deliberately was removed when rounds began opening on the
 * first response. Telling somebody to do an impossible thing is worse than
 * telling them nothing.
 *
 * So a superseded round comes back, and a deadline that has gone is cleared
 * with it — the steward is asking the question again, and a deadline nobody can
 * still meet would have `closeIfDue` close the round on the next page view.
 * `consent_eligible` is untouched either way: eligibility is a snapshot so that
 * "9 of 27" cannot change meaning underneath a community.
 */
type ReopenOutcome =
	/** There is a live round on this version — new or brought back. */
	| { round: 'open'; deadlineCleared: boolean }
	/** Nobody has ever answered this version; the first response opens one. */
	| { round: 'none' }
	/** The round is over. The version can be recorded, not answered. */
	| { round: 'closed' };

function reopenSupersededRound(db: Db, proposalPostId: string, now: number): ReopenOutcome {
	const round = db
		.select()
		.from(consentRound)
		.where(eq(consentRound.proposalPostId, proposalPostId))
		.get();
	if (!round) return { round: 'none' };
	if (round.status === 'open') return { round: 'open', deadlineCleared: false };
	if (round.status !== 'superseded') {
		// `closed` is the only other status anything writes; `cancelled` exists in
		// the enum and has never had a writer. Reported by what it is rather than
		// by what closed it, so the sentence this puts in the thread cannot claim
		// a deadline that was not there.
		return { round: 'closed' };
	}

	/**
	 * A round everybody had answered comes back like any other.
	 *
	 * It used to stay shut here, because `closeIfDue` closed a complete round on
	 * sight and reopening one produced a state that lasted until the next page
	 * view. A round now closes only at a deadline, so there is nothing to fight:
	 * the community is being asked again, and anybody who wants to move their
	 * answer can.
	 */
	const deadlineCleared = round.closesAt !== null && now >= round.closesAt.getTime();
	db.update(consentRound)
		.set({
			status: 'open',
			closedAt: null,
			supersededByPostId: null,
			...(deadlineCleared ? { closesAt: null } : {})
		})
		.where(eq(consentRound.id, round.id))
		.run();
	return { round: 'open', deadlineCleared };
}

/**
 * The eligible members of a round who have not answered it.
 *
 * Who a reopened round is announced to. Not the people who already responded:
 * their answer still counts and still stands, and telling them a question they
 * have answered is open again is asking them to do something twice.
 */
function awaitingResponse(db: Db, proposalPostId: string): string[] {
	const round = db
		.select()
		.from(consentRound)
		.where(eq(consentRound.proposalPostId, proposalPostId))
		.get();
	if (!round) return [];

	const answered = new Set(
		db
			.select({ membershipId: consentResponse.membershipId })
			.from(consentResponse)
			.where(eq(consentResponse.roundId, round.id))
			.all()
			.map((row) => row.membershipId)
	);
	return db
		.select({ membershipId: consentEligible.membershipId })
		.from(consentEligible)
		.where(eq(consentEligible.roundId, round.id))
		.all()
		.map((row) => row.membershipId)
		.filter((id) => !answered.has(id));
}

/**
 * Put an earlier version back on the table. `openspec/changes/movable-current-proposal`.
 *
 * The community can freeze v3 while v4 exists and, until this, could not
 * finish *asking* about it: nine of twenty-seven consent, somebody posts v4,
 * and the other eighteen can never answer v3 again. Moving the question is a
 * steward act because it decides what the community is being asked, and it
 * closes whatever round is running to do it.
 *
 * One transaction, and one round open at the end of it. Not on
 * `VotingProvider`, and not importing the built-in provider either — see
 * `reopenSupersededRound` above for why both of those are the same rule.
 */
export function setCurrentProposal(
	ctx: Ctx,
	input: { discussionId: string; proposalPostId: string; reason?: string | null },
	options: { db?: Db } = {}
): Discussion {
	requirePermission(ctx, 'proposal.set_current');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();

	const found = getDiscussion(ctx, input.discussionId, { db });

	const target = db
		.select()
		.from(post)
		.where(and(eq(post.id, input.proposalPostId), eq(post.discussionId, found.id)))
		.get();
	// A post from another discussion, or another community's, is not found rather
	// than refused: neither may teach anybody that it exists.
	if (!target) error(404, 'Not found');
	if (target.kind !== 'proposal') {
		error(400, 'Only a proposal version can be the question.');
	}
	// Already there. Silently, and with no post: a steward pressing the button
	// twice has not moved anything, and a thread that says so twice is noise in
	// the one record a freeze is argued about from.
	if (found.currentProposalPostId === target.id) return found;

	const previous = found.currentProposalPostId
		? (db.select().from(post).where(eq(post.id, found.currentProposalPostId)).get() ?? null)
		: null;

	return db.transaction((tx) => {
		const inTx = tx as unknown as Db;

		const outcome = reopenSupersededRound(inTx, target.id, now);

		if (found.currentProposalPostId) {
			tx.update(consentRound)
				.set({ status: 'superseded', closedAt: new Date(now), supersededByPostId: target.id })
				.where(
					and(
						eq(consentRound.proposalPostId, found.currentProposalPostId),
						eq(consentRound.status, 'open')
					)
				)
				.run();
		}

		tx.update(discussion)
			.set({ currentProposalPostId: target.id })
			.where(eq(discussion.id, found.id))
			.run();

		/**
		 * The move, in the thread.
		 *
		 * `docs/03` §3 treats a revision note as an event a member reads rather
		 * than as metadata, and moving the question is at least as consequential:
		 * it changes what everybody is being asked. So it takes the same shape —
		 * a post, attributed, saying where the question went.
		 */
		const reason = input.reason?.trim();
		writeThreadPost(ctx, inTx, {
			discussionId: found.id,
			kind: 'event',
			subjectPostId: target.id,
			body:
				`Put v${target.proposalVersion} back on the table` +
				(previous?.proposalVersion ? `, from v${previous.proposalVersion}` : '') +
				(reason ? ` — ${reason}` : '.') +
				(outcome.round === 'open' && outcome.deadlineCleared
					? ' The round reopened without its deadline, which had passed.'
					: '') +
				(outcome.round === 'closed' ? ' Its round is over, so it takes no new responses.' : '')
		});

		/**
		 * The people with something to do, and nobody else.
		 *
		 * `writeThreadPost` notifies nobody, and reopening creates no round — so
		 * without this the members whose live round just came back would hear
		 * nothing at all. Those who already answered are not told: their response
		 * still counts, and nothing is being asked of them again. Nobody is told
		 * about the round that closed, because a closed round needs no action.
		 */
		const waiting = awaitingResponse(inTx, target.id);
		if (waiting.length > 0) {
			notify(inTx, ctx, {
				kind: 'consent.opened',
				subjectType: 'discussion',
				subjectId: found.id,
				summary: 'A proposal is open for your response',
				params: { title: found.title },
				recipients: waiting,
				mail: true
			});
		}

		return tx.select().from(discussion).where(eq(discussion.id, found.id)).get()!;
	});
}

/**
 * The proposal a freeze would adopt.
 *
 * Refuses rather than returning null, because the caller is about to record a
 * decision and "there is nothing to record" is worth saying plainly. Freezing is
 * built in group 5; this is the question it asks.
 */
export function proposalToFreeze(
	ctx: Ctx,
	discussionId: string,
	options: { db?: Db; proposalPostId?: string } = {}
): Post {
	/**
	 * The version the steward chose, and otherwise the one being asked about.
	 *
	 * A community can vote v3 through, watch v4 draw objections, and want v3.
	 * Resolving the latest at submission time made that impossible in one
	 * direction and silently recorded the wrong text in the other — a steward who
	 * read v3 and submitted after v4 landed adopted v4's words under v3's tally.
	 *
	 * The fallback is the *current* version rather than the newest, and for the
	 * same reason: a form that carries no version id would otherwise record v4's
	 * words under the tally v3 was given — the identical failure, arriving
	 * through the one door still open to it.
	 */
	const found = getDiscussion(ctx, discussionId, options);
	const proposal = options.proposalPostId
		? proposalInDiscussion(discussionId, options.proposalPostId, options)
		: currentProposal(found, options);

	if (!proposal) {
		error(409, 'There is no proposal to record yet. Write one first, then freeze it.');
	}
	if (proposal.frozenDecisionId) {
		error(409, 'That proposal has already been recorded as a decision.');
	}
	return proposal;
}

/**
 * The version a discussion is currently asking about, or null while it has none.
 *
 * Reads the column rather than the highest version number. `latestProposal` is
 * still right for the callers that mean *newest* — the rail's "v4 is the later
 * version" warning is about newest, by definition — and wrong for every caller
 * that means *the question*.
 *
 * Takes the `Discussion` and no `Ctx`, because it checks nothing: the caller
 * has already been through `getDiscussion`, which is where the community is
 * checked. A `ctx` parameter this ignored would read as a guard and be none.
 */
export function currentProposal(found: Discussion, options: { db?: Db } = {}): Post | null {
	if (!found.currentProposalPostId) return null;
	const db = options.db ?? getDb();
	return (
		db
			.select()
			.from(post)
			.where(and(eq(post.id, found.currentProposalPostId), eq(post.discussionId, found.id)))
			.get() ?? null
	);
}

/** A proposal, but only if it is this discussion's. */
function proposalInDiscussion(
	discussionId: string,
	proposalPostId: string,
	options: { db?: Db }
): Post | null {
	const db = options.db ?? getDb();
	const found = db
		.select()
		.from(post)
		.where(and(eq(post.id, proposalPostId), eq(post.discussionId, discussionId)))
		.get();
	// A proposal from a different thread is not a proposal this freeze may adopt,
	// and saying which it was would confirm it exists.
	if (!found || found.kind !== 'proposal') error(404, 'Not found');
	return found;
}

registerTenantService({ name: 'discussions.get', subject: 'discussion', call: getDiscussion });
registerTenantService({ name: 'discussions.posts', subject: 'discussion', call: listPosts });
registerTenantService({
	name: 'discussions.postsWithAuthors',
	subject: 'discussion',
	call: listPostsWithAuthors
});
registerTenantService({
	name: 'discussions.latestProposal',
	subject: 'discussion',
	call: latestProposal
});
registerTenantService({
	name: 'discussions.addMessage',
	subject: 'discussion',
	call: (ctx, subjectId) => addMessage(ctx, { discussionId: subjectId, body: 'x' })
});
registerTenantService({
	name: 'discussions.addProposal',
	subject: 'discussion',
	call: (ctx, subjectId) => addProposal(ctx, { discussionId: subjectId, body: 'x' })
});
registerTenantService({
	name: 'discussions.takeOffline',
	subject: 'discussion',
	call: (ctx, subjectId) =>
		takeOffline(ctx, { discussionId: subjectId, summary: 'x', proposal: 'x' })
});
registerTenantService({
	name: 'discussions.proposalToFreeze',
	subject: 'discussion',
	call: proposalToFreeze
});
/**
 * Keyed on the *proposal*, because that is the id an attacker would supply: the
 * discussion is theirs and the version is somebody else's. Moving the question
 * to another community's post must answer 404 like everything else.
 */
registerTenantService({
	name: 'discussions.setCurrentProposal',
	subject: 'proposal',
	call: (ctx, subjectId) =>
		setCurrentProposal(ctx, { discussionId: subjectId, proposalPostId: subjectId })
});

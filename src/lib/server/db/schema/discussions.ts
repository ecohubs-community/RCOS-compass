import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community, membership } from './tenancy.js';
import { definition } from './definitions.js';

/**
 * How a community gets from a gap to something worth freezing.
 * docs/03-data-model.md §3, UI spec §5.1.
 */

export const discussion = sqliteTable(
	'discussion',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		/** One or the other: a clause with no definition yet, or an existing one. */
		definitionId: text('definition_id').references(() => definition.id, { onDelete: 'cascade' }),
		clauseKey: text('clause_key'),
		/**
		 * The section this thread answers — the Path item it was started from.
		 *
		 * A Path item is a section, and a section can own several clauses or
		 * none at all. The thread used to name only a clause and find its section
		 * through `clause.owner`, which left the 28 sections owning no countable
		 * clause with nothing to file against, and let a thread filed under a
		 * clause a section only *references* freeze into the clause's owner.
		 *
		 * Null for a thread about a clause typed by hand, a definition or nothing;
		 * `sectionOf()` then falls back to the clause's owner, which is what every
		 * thread opened before this column existed relies on.
		 */
		sectionKey: text('section_key'),
		title: text('title').notNull(),
		status: text('status', {
			enum: ['open', 'in_vote', 'decided_offline', 'frozen', 'abandoned']
		})
			.notNull()
			.default('open'),
		/** A hook for the post-MVP Ask AI flow; `offline` is UI spec §5.1's second path. */
		origin: text('origin', { enum: ['clause', 'ai_session', 'offline'] })
			.notNull()
			.default('clause'),
		openedBy: text('opened_by').references(() => user.id, { onDelete: 'set null' }),
		openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
		/** Drives "stalled 12 days" on the dashboard. */
		lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' }).notNull(),
		frozenDecisionId: text('frozen_decision_id'),
		/**
		 * The proposal version the community is currently being asked about.
		 *
		 * Named rather than derived. It used to be `max(proposal_version)`, which
		 * made writing a version the only event that could move the question and
		 * made that move irreversible: nine of twenty-seven consent to v3,
		 * somebody posts v4, and the other eighteen can never answer v3 again.
		 * Posting still moves it forward; a steward can move it back.
		 *
		 * No foreign key, exactly like `frozen_decision_id` above it:
		 * `post.discussion_id` already references this table on cascade, so a
		 * constraint pointing the other way is a cycle SQLite has to unpick every
		 * time a community is deleted. Posts are never deleted here, so the
		 * stale-id risk it trades for is theoretical.
		 */
		currentProposalPostId: text('current_proposal_post_id')
	},
	(table) => [
		index('discussion_community_idx').on(table.communityId, table.lastActivityAt),
		index('discussion_definition_idx').on(table.definitionId),
		index('discussion_section_idx').on(table.communityId, table.sectionKey)
	]
);

/**
 * Everything a thread says, in the order it was said.
 *
 * A proposal is a post with `kind = 'proposal'` and a `proposalVersion`, not a
 * table of its own — it belongs to the thread it was written in, and a second
 * table would be a second thing to keep in step with it.
 *
 * The kind says what the post *is*, because a reader has to be able to tell a
 * reason given with a vote from a reply, and a steward moving the question
 * from somebody's opinion — they are all text by a person, and until they
 * carried a kind the thread rendered them identically:
 *
 * - `message` — a reply, written in the composer.
 * - `proposal` — a version of the text a decision would adopt.
 * - `offline_summary` — what happened in a meeting. `subjectPostId` is the
 *   proposal the meeting produced, when it produced one.
 * - `response` — the reason somebody gave with their answer to a round.
 *   `responseValue` is the answer and `subjectPostId` the version it answered.
 * - `event` — the thread recording an act on it (the question moved to
 *   another version). `subjectPostId` is the version it concerns.
 */
export const post = sqliteTable(
	'post',
	{
		id: text('id').primaryKey(),
		discussionId: text('discussion_id')
			.notNull()
			.references(() => discussion.id, { onDelete: 'cascade' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		body: text('body').notNull(),
		kind: text('kind', {
			enum: ['message', 'proposal', 'offline_summary', 'response', 'event', 'move_request']
		})
			.notNull()
			.default('message'),
		/**
		 * The answer a `response` post gave, as it was given. Not read back from
		 * `consent_response`: that row is replaced when somebody changes their
		 * mind, and the post that carried their first answer stays in the thread
		 * saying what it said then.
		 */
		responseValue: text('response_value', { enum: ['consent', 'objection', 'abstain'] }),
		/**
		 * The proposal version a `response` or `event` is about, or the one an
		 * `offline_summary` produced. No foreign key,
		 * for the same reason `frozen_decision_id` has none: a post pointing at a
		 * post in its own thread, which the discussion's cascade already removes.
		 */
		subjectPostId: text('subject_post_id'),
		/**
		 * The post this one answers, when it was written as a reply to a message
		 * or to the reason given with an answer. Always the top of the exchange:
		 * a reply to a reply is filed under the post that started it, so a thread
		 * is one level deep and stays readable on a phone. No foreign key, for the
		 * same reason as `subject_post_id`.
		 */
		replyToPostId: text('reply_to_post_id'),
		/** 1, 2, 3 … across the proposals of one discussion. Null for a message. */
		proposalVersion: integer('proposal_version'),
		/**
		 * The linter's per-line result for this version, stored when it was
		 * written. Never recomputed on read: a result describes the text as it was
		 * judged, and re-running is an act somebody takes.
		 */
		linterResult: text('linter_result', { mode: 'json' }),
		/**
		 * What this revision changed, in the reviser's own words. Optional: a
		 * revision without one is still a revision, and a required note would be
		 * answered with "updated".
		 */
		revisionNote: text('revision_note'),
		/**
		 * Set inside the freeze transaction. A proposal freezes once: the
		 * idempotency key stops one person submitting twice and cannot stop two
		 * people submitting once each, and a second freeze would have nothing left
		 * to adopt.
		 */
		frozenDecisionId: text('frozen_decision_id'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		/** When its author last changed a message. Shown as "edited". */
		editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
		/**
		 * When its author deleted a message. The row stays, so the replies under
		 * it keep their place and the author can restore it; the text is never
		 * sent to anybody else once this is set.
		 */
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('post_discussion_idx').on(table.discussionId, table.createdAt),
		uniqueIndex('post_proposal_version_idx').on(table.discussionId, table.proposalVersion)
	]
);

/**
 * Dissent, with a state rather than a reaction.
 *
 * The application enforces nobody's threshold — freezing over an open objection
 * is allowed — but it refuses to let one disappear. Dissent that evaporates at
 * the moment of recording is how a community ends up arguing about what was
 * agreed. There is no delete.
 */
export const objection = sqliteTable(
	'objection',
	{
		id: text('id').primaryKey(),
		proposalPostId: text('proposal_post_id')
			.notNull()
			.references(() => post.id, { onDelete: 'cascade' }),
		raisedBy: text('raised_by').references(() => user.id, { onDelete: 'set null' }),
		reason: text('reason').notNull(),
		/**
		 * The post in the thread that says it, so the thread can show where the
		 * objection stands next to the words that raised it. Null for an
		 * objection raised outside a round.
		 */
		postId: text('post_id'),
		raisedAt: integer('raised_at', { mode: 'timestamp_ms' }).notNull(),
		state: text('state', { enum: ['open', 'withdrawn', 'addressed', 'overruled'] })
			.notNull()
			.default('open'),
		resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
		resolutionNote: text('resolution_note')
	},
	(table) => [index('objection_proposal_idx').on(table.proposalPostId)]
);

export const consentRound = sqliteTable(
	'consent_round',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		proposalPostId: text('proposal_post_id')
			.notNull()
			.references(() => post.id, { onDelete: 'cascade' }),
		openedBy: text('opened_by').references(() => user.id, { onDelete: 'set null' }),
		openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
		/**
		 * Optional, because a round nobody opened deliberately has no deadline
		 * anybody chose. A round opens on the first response; inventing a window
		 * for it would mean expiring a community's question on a schedule it never
		 * agreed to.
		 */
		closesAt: integer('closes_at', { mode: 'timestamp_ms' }),
		/**
		 * `superseded` rather than `cancelled`: nobody cancelled this round, the
		 * text it was about stopped being the text on the table. Members read this
		 * state, and a status that misdescribes what happened is a small lie in a
		 * record whose whole claim is accuracy.
		 */
		status: text('status', { enum: ['open', 'closed', 'cancelled', 'superseded'] })
			.notNull()
			.default('open'),
		closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
		/** The version that replaced the one this round was about. */
		supersededByPostId: text('superseded_by_post_id'),
		eligibility: text('eligibility', { enum: ['all_members', 'selected'] })
			.notNull()
			.default('all_members')
	},
	(table) => [index('consent_round_community_idx').on(table.communityId, table.status)]
);

/**
 * Who may respond, captured when the round opens.
 *
 * A snapshot rather than a live query: someone who joins mid-round is not
 * eligible, and the denominator a community was told about at the start is the
 * one it is held to at the end. "9 of 11 responded" must not change meaning
 * because a twelfth person arrived.
 */
export const consentEligible = sqliteTable(
	'consent_eligible',
	{
		roundId: text('round_id')
			.notNull()
			.references(() => consentRound.id, { onDelete: 'cascade' }),
		membershipId: text('membership_id')
			.notNull()
			.references(() => membership.id, { onDelete: 'cascade' })
	},
	(table) => [uniqueIndex('consent_eligible_idx').on(table.roundId, table.membershipId)]
);

export const consentResponse = sqliteTable(
	'consent_response',
	{
		roundId: text('round_id')
			.notNull()
			.references(() => consentRound.id, { onDelete: 'cascade' }),
		membershipId: text('membership_id')
			.notNull()
			.references(() => membership.id, { onDelete: 'cascade' }),
		value: text('value', { enum: ['consent', 'objection', 'abstain'] }).notNull(),
		/** An objection response carries the objection it raised. */
		objectionId: text('objection_id').references(() => objection.id, { onDelete: 'set null' }),
		/**
		 * The reason, as a post in the thread.
		 *
		 * A reason is a thing somebody said, so it lives where the rest of what
		 * they said lives — quotable, attributable, and readable in order. Holding
		 * it as a string here as well would be two texts that have to agree.
		 */
		reasonPostId: text('reason_post_id').references(() => post.id, { onDelete: 'set null' }),
		respondedAt: integer('responded_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		// One response per member: changing your mind replaces, never duplicates.
		uniqueIndex('consent_response_idx').on(table.roundId, table.membershipId)
	]
);

export type Discussion = typeof discussion.$inferSelect;
export type Post = typeof post.$inferSelect;
export type Objection = typeof objection.$inferSelect;
export type ConsentRound = typeof consentRound.$inferSelect;
export type ConsentResponse = typeof consentResponse.$inferSelect;

/**
 * A member asking for the question to be moved back to an earlier version.
 *
 * The objection pattern: a post in the thread carries it, so the community reads
 * it where it reads everything else, and this row carries its state, so it has
 * an answer and nobody has to remember to give one. docs/03 §3,
 * `openspec/changes/provenance-ui` D10.
 *
 * Settled in the same transaction as anything that moves the question: granted
 * when it moves to the version asked for, lapsed when it moves elsewhere.
 */
export const proposalMoveRequest = sqliteTable(
	'proposal_move_request',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		discussionId: text('discussion_id')
			.notNull()
			.references(() => discussion.id, { onDelete: 'cascade' }),
		requestedBy: text('requested_by').references(() => user.id, { onDelete: 'set null' }),
		/** The version asked for. No foreign key, as for `current_proposal_post_id`. */
		targetProposalPostId: text('target_proposal_post_id').notNull(),
		/** What was current when it was asked, so the post can say "instead of v4". */
		fromProposalPostId: text('from_proposal_post_id'),
		/** The thread post that carries it. */
		postId: text('post_id').notNull(),
		state: text('state', { enum: ['open', 'granted', 'declined', 'withdrawn', 'lapsed'] })
			.notNull()
			.default('open'),
		reason: text('reason').notNull(),
		requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
		answeredBy: text('answered_by').references(() => user.id, { onDelete: 'set null' }),
		answeredAt: integer('answered_at', { mode: 'timestamp_ms' }),
		answerNote: text('answer_note')
	},
	(table) => [
		index('proposal_move_request_discussion_idx').on(table.discussionId, table.state),
		/**
		 * One open request per member per discussion. Partial, so the settled ones
		 * stay beside it as history.
		 */
		uniqueIndex('proposal_move_request_open_idx')
			.on(table.discussionId, table.requestedBy)
			.where(sql`${table.state} = 'open'`)
	]
);

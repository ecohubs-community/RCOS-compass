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
		frozenDecisionId: text('frozen_decision_id')
	},
	(table) => [
		index('discussion_community_idx').on(table.communityId, table.lastActivityAt),
		index('discussion_definition_idx').on(table.definitionId)
	]
);

/**
 * A message, a proposal, or the summary of a meeting.
 *
 * A proposal is a post with `kind = 'proposal'` and a `proposalVersion`, not a
 * table of its own — it belongs to the thread it was written in, and a second
 * table would be a second thing to keep in step with it.
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
		kind: text('kind', { enum: ['message', 'proposal', 'offline_summary'] })
			.notNull()
			.default('message'),
		/** 1, 2, 3 … across the proposals of one discussion. Null for a message. */
		proposalVersion: integer('proposal_version'),
		/**
		 * Set inside the freeze transaction. A proposal freezes once: the
		 * idempotency key stops one person submitting twice and cannot stop two
		 * people submitting once each, and a second freeze would have nothing left
		 * to adopt.
		 */
		frozenDecisionId: text('frozen_decision_id'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		editedAt: integer('edited_at', { mode: 'timestamp_ms' })
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
		closesAt: integer('closes_at', { mode: 'timestamp_ms' }).notNull(),
		status: text('status', { enum: ['open', 'closed', 'cancelled'] })
			.notNull()
			.default('open'),
		closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
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

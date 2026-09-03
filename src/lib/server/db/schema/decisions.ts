import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community, membership } from './tenancy.js';
import { post } from './discussions.js';

/**
 * The register. docs/03-data-model.md §3, §6.
 *
 * A decision that cannot be found, attributed and quoted a year later is worse
 * than no decision recorded at all, because the community will believe it has
 * one. Everything here follows from that.
 */
export const decision = sqliteTable(
	'decision',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		/**
		 * Per-community and gapless, allocated inside the freeze transaction.
		 * Drafts never consume one.
		 */
		seq: integer('seq').notNull(),
		/**
		 * `DEC-2026-014`. The year is a stamp taken in the community's own
		 * timezone, not part of the key — `seq` keeps counting across years, so the
		 * fifteenth decision is `DEC-2027-015`. Resetting each year would make
		 * `DEC-2027-001` ambiguous with an imported record and "our fourteenth
		 * decision" unanswerable.
		 */
		ref: text('ref').notNull(),
		title: text('title').notNull(),
		type: text('type', { enum: ['constitutional', 'strategic', 'operational'] }).notNull(),
		layer: integer('layer'),
		mechanism: text('mechanism').notNull(),
		threshold: text('threshold'),
		tallyPresent: integer('tally_present'),
		tallyFor: integer('tally_for'),
		tallyAgainst: integer('tally_against'),
		/** Recorded even when zero, so "frozen with 1 unresolved objection" is data. */
		unresolvedObjections: integer('unresolved_objections').notNull().default(0),
		rationale: text('rationale'),
		/** The proposal exactly as adopted, so the register quotes itself. */
		proposalText: text('proposal_text').notNull(),
		decidedAt: integer('decided_at', { mode: 'timestamp_ms' }).notNull(),
		reviewDueAt: integer('review_due_at', { mode: 'timestamp_ms' }),
		/** Whether the room or the thread decided it. Both are first-class. */
		source: text('source', { enum: ['online', 'offline'] })
			.notNull()
			.default('online'),
		provisional: integer('provisional', { mode: 'boolean' }).notNull().default(false),
		status: text('status', { enum: ['active', 'superseded', 'withdrawn'] })
			.notNull()
			.default('active'),
		supersededById: text('superseded_by_id'),
		/**
		 * Minted when the freeze form renders. Stops one person submitting twice;
		 * it cannot stop two people submitting once each, which is what
		 * `post.frozenDecisionId` is for.
		 */
		idempotencyKey: text('idempotency_key').notNull(),
		recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),
		proposalPostId: text('proposal_post_id').references(() => post.id, { onDelete: 'set null' })
	},
	(table) => [
		uniqueIndex('decision_seq_idx').on(table.communityId, table.seq),
		uniqueIndex('decision_ref_idx').on(table.communityId, table.ref),
		// Enforced by the database, not by a check-then-insert: the window between
		// checking and inserting is exactly where the duplicate gets in.
		uniqueIndex('decision_idempotency_idx').on(table.communityId, table.idempotencyKey),
		index('decision_decided_idx').on(table.communityId, table.decidedAt)
	]
);

/**
 * Who was in the room, and whether they agreed to be named outside it.
 *
 * The consent is captured at the freeze because it cannot be collected
 * retroactively — publishing is P6, and by then the meeting is a year gone.
 */
export const decisionAttendee = sqliteTable(
	'decision_attendee',
	{
		id: text('id').primaryKey(),
		decisionId: text('decision_id')
			.notNull()
			.references(() => decision.id, { onDelete: 'cascade' }),
		membershipId: text('membership_id').references(() => membership.id, { onDelete: 'set null' }),
		/** Someone present who is not a member — a facilitator, a neighbour. */
		externalName: text('external_name'),
		consentedToPublish: integer('consented_to_publish', { mode: 'boolean' })
			.notNull()
			.default(false)
	},
	(table) => [index('decision_attendee_decision_idx').on(table.decisionId)]
);

/**
 * Which clauses a decision answered, **as quoted at the time**.
 *
 * `ref` is never rewritten by a migration or a standard upgrade. A decision
 * recorded against core 0.1's `3.6.3` must still say `3.6.3` after 0.2 renumbers
 * it: the community decided about the clause that carried that number in the
 * version they had adopted, and silently updating it would rewrite what they
 * decided about. `clauseKey` is stored alongside so the application can still
 * follow the same obligation across versions when it needs to.
 */
export const decisionClause = sqliteTable(
	'decision_clause',
	{
		decisionId: text('decision_id')
			.notNull()
			.references(() => decision.id, { onDelete: 'cascade' }),
		standardId: text('standard_id').notNull(),
		version: text('version').notNull(),
		ref: text('ref').notNull(),
		clauseKey: text('clause_key').notNull()
	},
	(table) => [uniqueIndex('decision_clause_idx').on(table.decisionId, table.clauseKey)]
);

/**
 * The community's own history, append-only. Distinct from `audit_event`, which
 * is the platform's: this one is written for members to read.
 */
export const changeLog = sqliteTable(
	'change_log',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		at: integer('at', { mode: 'timestamp_ms' }).notNull(),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		kind: text('kind').notNull(),
		subjectType: text('subject_type').notNull(),
		subjectId: text('subject_id').notNull(),
		summary: text('summary').notNull(),
		payload: text('payload', { mode: 'json' })
	},
	(table) => [index('change_log_community_idx').on(table.communityId, table.at)]
);

export type Decision = typeof decision.$inferSelect;
export type DecisionAttendee = typeof decisionAttendee.$inferSelect;
export type ChangeLogEntry = typeof changeLog.$inferSelect;

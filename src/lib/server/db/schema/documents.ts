import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community, communityStandard } from './tenancy.js';
import { definition } from './definitions.js';

/**
 * What a community already wrote down, before Compass existed.
 * docs/03-data-model.md §3, docs/04-security.md §5.
 *
 * The distinction this file exists to keep straight is between two claims of
 * very different strength:
 *
 * - **Evidence** says *"we have language about this"*. It points at a passage in
 *   a document the community uploaded, and it moves no number.
 * - A **definition** says *"we decided this"*. It moves readiness, and it can
 *   only be reached through a decision.
 *
 * Evidence is the on-ramp to the second, never a substitute for it. The moment
 * evidence counts toward readiness, the number stops meaning what the rest of the
 * product says it means and the outward compliance claim becomes false.
 */

/**
 * An uploaded file.
 *
 * `status` is the whole lifecycle, and `reference_only` is the one worth naming:
 * a scan, or any PDF with no text layer. The file is kept and a person can read
 * it; Compass says plainly that it cannot. That is a **success** state — a
 * community that uploaded a scan has done nothing wrong, and presenting zero
 * extracted passages as an empty document would tell them their bylaws say
 * nothing.
 */
export const document = sqliteTable(
	'document',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		mime: text('mime').notNull(),
		bytes: integer('bytes').notNull(),
		/** Of the file as stored, so a re-upload of the same bytes is recognisable. */
		sha256: text('sha256').notNull(),
		/** Relative to `UPLOAD_DIR`. Never a path the client supplied. */
		storageKey: text('storage_key').notNull(),
		status: text('status', {
			enum: ['uploaded', 'extracting', 'extracted', 'reference_only', 'failed']
		}).notNull(),
		/**
		 * Why it is in the state it is in, in words a member can read. The first
		 * job whose outcome is shown on a screen rather than only in a log.
		 */
		statusDetail: text('status_detail'),
		/** Extracted, and the count the ceiling stopped at — reported, never dropped. */
		pagesExtracted: integer('pages_extracted'),
		pagesTotal: integer('pages_total'),
		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		uploadedAt: integer('uploaded_at', { mode: 'timestamp_ms' }).notNull(),
		extractedAt: integer('extracted_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('document_community_idx').on(table.communityId, table.uploadedAt),
		// Checked in the database, because drizzle's `text({ enum })` is a
		// TypeScript narrowing and SQLite stores whatever it is handed — proved in
		// P3 by a decision that reached the register with a type no screen renders.
		check(
			'document_status_ck',
			sql`${table.status} in ('uploaded', 'extracting', 'extracted', 'reference_only', 'failed')`
		)
	]
);

/**
 * A piece of a document, as the community wrote it.
 *
 * `bbox` stays null in P4 — highlighting is by passage, not by pixel — and the
 * column exists so adding it later is not a migration of live evidence.
 */
export const passage = sqliteTable(
	'passage',
	{
		id: text('id').primaryKey(),
		documentId: text('document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		page: integer('page').notNull(),
		/** Order within the page. Together with `page`, the passage's address. */
		ordinal: integer('ordinal').notNull(),
		text: text('text').notNull(),
		/** So the same paragraph in a re-uploaded document is recognisable. */
		textHash: text('text_hash').notNull(),
		bbox: text('bbox')
	},
	(table) => [
		index('passage_document_idx').on(table.documentId, table.page, table.ordinal),
		uniqueIndex('passage_position_idx').on(table.documentId, table.page, table.ordinal)
	]
);

/**
 * "We have language about this clause, over here."
 *
 * `suggested_by` records whether a person or a model proposed it, and the two
 * are not interchangeable: a model may only ever produce `suggested`. Nothing
 * reaches `confirmed` without a person, which is enforced in the service and
 * asserted by a test, and the AI module cannot reach a writing service at all.
 *
 * `quote` is the passage's text at the moment the claim was made. It is what
 * keeps stale evidence *readable*: when the document behind it is destroyed the
 * passage goes, `passage_id` goes null, and what the community said it had —
 * and who said so — survives, per the change's `evidence` spec.
 */
export const evidence = sqliteTable(
	'evidence',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		/** Null once the passage is gone; the evidence is then `stale`. */
		passageId: text('passage_id').references(() => passage.id, { onDelete: 'set null' }),
		quote: text('quote').notNull(),
		/** Which standard version this claim was made against. */
		communityStandardId: text('community_standard_id')
			.notNull()
			.references(() => communityStandard.id, { onDelete: 'cascade' }),
		clauseKey: text('clause_key').notNull(),
		state: text('state', {
			enum: ['suggested', 'confirmed', 'dismissed', 'stale']
		}).notNull(),
		/** A model's own estimate, kept for calibration. Never a threshold. */
		confidence: integer('confidence'),
		suggestedBy: text('suggested_by', { enum: ['ai', 'human'] }).notNull(),
		confirmedBy: text('confirmed_by').references(() => user.id, { onDelete: 'set null' }),
		confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		// One claim per passage per clause. A second suggestion for a pair somebody
		// already dismissed must update that row rather than arrive again.
		uniqueIndex('evidence_pair_idx').on(table.communityId, table.passageId, table.clauseKey),
		index('evidence_clause_idx').on(table.communityId, table.clauseKey, table.state),
		check(
			'evidence_state_ck',
			sql`${table.state} in ('suggested', 'confirmed', 'dismissed', 'stale')`
		),
		check('evidence_source_ck', sql`${table.suggestedBy} in ('ai', 'human')`),
		/**
		 * A settled state has somebody behind it. Confirming and dismissing are
		 * both human acts and both attributable; a suggestion has no confirmer by
		 * definition; and stale keeps whatever it had — evidence that was confirmed
		 * keeps its confirmer when it goes stale, and a suggestion that went stale
		 * never had one.
		 */
		check(
			'evidence_settled_ck',
			sql`(${table.state} = 'suggested' and ${table.confirmedBy} is null and ${table.confirmedAt} is null)
				or (${table.state} in ('confirmed', 'dismissed') and ${table.confirmedBy} is not null and ${table.confirmedAt} is not null)
				or (${table.state} = 'stale')`
		)
	]
);

/**
 * Where a definition's text came from, when it came from a document.
 *
 * Recorded on the version rather than the definition: a reader a year later
 * needs to know that this wording began as the community's own 2019 bylaws, and
 * that cannot be reconstructed afterwards.
 */
export const definitionSource = sqliteTable(
	'definition_source',
	{
		definitionId: text('definition_id')
			.primaryKey()
			.references(() => definition.id, { onDelete: 'cascade' }),
		evidenceId: text('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),
		passageId: text('passage_id').references(() => passage.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('definition_source_evidence_idx').on(table.evidenceId)]
);

/**
 * One model call. docs/00-architecture.md §4 rule 5.
 *
 * `inputSha256` and never the input. Governance drafts are among the most
 * sensitive text a community holds, and a log that keeps them is a second copy
 * outside every control the application has.
 */
export const aiCall = sqliteTable(
	'ai_call',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		task: text('task').notNull(),
		model: text('model').notNull(),
		tokensIn: integer('tokens_in').notNull().default(0),
		tokensOut: integer('tokens_out').notNull().default(0),
		ms: integer('ms').notNull().default(0),
		inputSha256: text('input_sha256').notNull(),
		ok: integer('ok', { mode: 'boolean' }).notNull(),
		/** Why it failed, for the member. Never the model's raw output. */
		detail: text('detail'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('ai_call_community_idx').on(table.communityId, table.createdAt)]
);

/**
 * Rolled-up usage, for the limits in docs/04-security.md §5.3.
 *
 * Per member first and per community as the backstop, because the property that
 * matters is that one enthusiastic member cannot drain everyone else's month.
 */
export const aiUsage = sqliteTable(
	'ai_usage',
	{
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		/** Null for the community-wide row. */
		actorId: text('actor_id').references(() => user.id, { onDelete: 'cascade' }),
		/** `YYYY-MM-DD` in the community's timezone; empty for a month-only row. */
		periodDay: text('period_day').notNull(),
		/** `YYYY-MM`, likewise. */
		periodMonth: text('period_month').notNull(),
		tasks: integer('tasks').notNull().default(0),
		tokens: integer('tokens').notNull().default(0)
	},
	(table) => [
		uniqueIndex('ai_usage_idx').on(
			table.communityId,
			table.actorId,
			table.periodDay,
			table.periodMonth
		)
	]
);

export type Document = typeof document.$inferSelect;
export type Passage = typeof passage.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type AiCall = typeof aiCall.$inferSelect;

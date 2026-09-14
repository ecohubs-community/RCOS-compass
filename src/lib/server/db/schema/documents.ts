import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community, communityStandard } from './tenancy.js';
import { definition } from './definitions.js';
import { firstPublishedAt, visibility } from './visibility.js';

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
		/**
		 * Which reader produced the passages. Null means the first reader, the one
		 * that could not find a paragraph inside a PDF page. Anything below the
		 * current version is re-read once at startup — see jobs/reread.ts.
		 */
		extractorVersion: integer('extractor_version'),
		visibility: visibility(),
		firstPublishedAt: firstPublishedAt(),

		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		uploadedAt: integer('uploaded_at', { mode: 'timestamp_ms' }).notNull(),
		extractedAt: integer('extracted_at', { mode: 'timestamp_ms' }),

		/**
		 * The AI scan: the one mapping-related state that is *stored*, because a
		 * running job is a fact rather than a derivation. Everything a member reads
		 * as "Mapped" or "Mapping in progress" is derived (`mapping-state.ts`).
		 *
		 * Values enforced by trigger, not CHECK — adding a checked column rebuilds
		 * `document`, and the rebuild's DROP cascades into every child table inside
		 * the migrator's transaction (see 0010 and 0017).
		 */
		scanStatus: text('scan_status', {
			enum: ['none', 'queued', 'running', 'stopped', 'complete']
		})
			.notNull()
			.default('none'),
		/** Why a scan stopped, in words a member can read. */
		scanDetail: text('scan_detail'),
		/** Who started or last continued the scan, and is charged for it. */
		scanActor: text('scan_actor').references(() => user.id, { onDelete: 'set null' }),
		/**
		 * A fresh id written by every claim, and carried by the scan's jobs. Two
		 * claims by the same member over the same content — a stalled scan
		 * continued — are still two scans, and only the newest may write.
		 */
		scanClaim: text('scan_claim'),
		/** Moved by every batch; a live scan older than the stall threshold is stopped. */
		scanHeartbeatAt: integer('scan_heartbeat_at', { mode: 'timestamp_ms' }),
		/**
		 * Incremented by every act that replaces passages — extraction, replace,
		 * restore. A scan carries the value it was claimed at and writes nothing
		 * once it has moved.
		 */
		contentGeneration: integer('content_generation').notNull().default(0),
		/** A member's "Mark mapping as done". Cleared by a new scan or a new file. */
		mappingDoneAt: integer('mapping_done_at', { mode: 'timestamp_ms' }),
		mappingDoneBy: text('mapping_done_by').references(() => user.id, { onDelete: 'set null' })
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
 * `kind` separates the headings a reader navigates by from the paragraphs a
 * member maps: headings are typeset and given to the model as context, but they
 * are never mapping candidates and never counted.
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
		kind: text('kind', { enum: ['heading', 'paragraph'] })
			.notNull()
			.default('paragraph'),
		text: text('text').notNull(),
		/** So the same paragraph in a re-uploaded document is recognisable. */
		textHash: text('text_hash').notNull(),
		/**
		 * For a PDF passage: a JSON array of line boxes, one per source line —
		 * `{ x, y, w, h, start, end }` in the page's unrotated user space (points,
		 * origin bottom-left), with `start`/`end` the offsets into `text` that
		 * line carries. The viewer maps them through its own viewport, so zoom and
		 * rotation never touch stored data. Null for formats without a page.
		 */
		bbox: text('bbox'),
		/**
		 * When a scan sent this passage to the model. A continued scan never pays
		 * twice for a paragraph — including the many the model had nothing to say
		 * about, which "has evidence" could never tell apart from "never read".
		 */
		scannedAt: integer('scanned_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('passage_document_idx').on(table.documentId, table.page, table.ordinal),
		uniqueIndex('passage_position_idx').on(table.documentId, table.page, table.ordinal),
		check('passage_kind_ck', sql`${table.kind} in ('heading', 'paragraph')`)
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
		/**
		 * The document the claim was made about — kept when the passage goes, so
		 * stale evidence still knows where it came from: a replaced file can offer
		 * it for re-confirmation, and a definition can still name its source.
		 */
		documentId: text('document_id').references(() => document.id, { onDelete: 'set null' }),
		quote: text('quote').notNull(),
		/** Which standard version this claim was made against. */
		communityStandardId: text('community_standard_id')
			.notNull()
			.references(() => communityStandard.id, { onDelete: 'cascade' }),
		clauseKey: text('clause_key').notNull(),
		state: text('state', {
			enum: ['suggested', 'confirmed', 'dismissed', 'stale']
		}).notNull(),
		/** A model's own estimate, kept for calibration. Never a threshold, never shown. */
		confidence: integer('confidence'),
		/**
		 * A model's one-sentence reason: what the passage covers of the clause and
		 * what it leaves out. Shown in place of any strength, always as plain text.
		 */
		reason: text('reason'),
		/** The part of the passage the claim rests on, as offsets into its text. */
		excerptStart: integer('excerpt_start'),
		excerptEnd: integer('excerpt_end'),
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
 * An earlier file of a document. The `document` row always describes the
 * *current* file — every read path (extraction, search, the file route) keeps
 * working unchanged — and these are the files it replaced, kept so a mistaken or
 * harmful replacement is one "Restore" away. Deleted only by a steward, or with
 * the document.
 */
export const documentFileVersion = sqliteTable(
	'document_file_version',
	{
		id: text('id').primaryKey(),
		documentId: text('document_id')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		mime: text('mime').notNull(),
		bytes: integer('bytes').notNull(),
		sha256: text('sha256').notNull(),
		/** Relative to `UPLOAD_DIR`, like the document's own. */
		storageKey: text('storage_key').notNull(),
		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		uploadedAt: integer('uploaded_at', { mode: 'timestamp_ms' }).notNull(),
		/** Who put a newer file in its place, and when. */
		supersededBy: text('superseded_by').references(() => user.id, { onDelete: 'set null' }),
		supersededAt: integer('superseded_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		index('document_file_version_document_idx').on(table.documentId, table.supersededAt),
		index('document_file_version_community_idx').on(table.communityId)
	]
);

export type Document = typeof document.$inferSelect;
export type DocumentFileVersion = typeof documentFileVersion.$inferSelect;
export type Passage = typeof passage.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;

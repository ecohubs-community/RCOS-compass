import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community } from './tenancy.js';

/**
 * The three levels, as columns. UI spec §1.6, `docs/03-data-model.md` §9.
 *
 * "Public" means public *within the community*: `member` is the default and it
 * means every member, private from no member. `world` is opt-in per subject and
 * a governance act. `restricted` is the one legitimate reason to hide something
 * from a fellow member, and it is not a level anybody can simply set — it
 * requires a transparency exception with a justification, an audience and an
 * end date (RCOS §5.3.5).
 *
 * Defined once here rather than four times, because four copies of a CHECK is
 * three chances for them to disagree about what the levels are.
 */
export const VISIBILITY_LEVELS = ['member', 'world', 'restricted'] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

/** The column, for a table that can be published. */
export const visibility = () =>
	text('visibility', { enum: VISIBILITY_LEVELS }).notNull().default('member');

/**
 * When this was first made world-readable, set once and never cleared.
 *
 * It is what lets a withdrawn page answer **410 Gone** and one that was never
 * published answer 404. Current visibility cannot tell those apart — a subject
 * back at `member` looks exactly like one that was never anything else — and
 * reconstructing it by scanning the register for a publishing decision would put
 * a query over the decision table on every 404 of a public route, which is the
 * first thing a crawler finds.
 */
export const firstPublishedAt = () => integer('first_published_at', { mode: 'timestamp_ms' });

/**
 * The levels are enforced in the database — by a **trigger**, not a `CHECK`.
 *
 * Not a style choice. Adding a `CHECK` to an existing table requires SQLite's
 * twelve-step table rebuild, and drizzle-kit generates it with
 * `PRAGMA foreign_keys=OFF` around the `DROP TABLE`. That pragma is a **no-op
 * inside a transaction**, and drizzle's migrator runs every migration in one —
 * so the drop cascades. On this schema it silently deleted every local
 * definition attached to a community artifact, and the generated migration
 * passed on an empty database because there was nothing to lose.
 *
 * `ALTER TABLE … ADD COLUMN` needs no rebuild, so the column is added plainly
 * and a `BEFORE INSERT`/`BEFORE UPDATE` trigger raises `ABORT` on a value
 * outside the three. Same guarantee at the same layer, and a migration that
 * cannot eat data. The triggers are hand-written in the migration, like the
 * FTS5 table in P5, and `tests/integration/visibility-schema.test.ts` proves
 * they refuse what they exist to refuse.
 */

/**
 * What a restricted subject is, so the exception can name it.
 *
 * A string rather than four nullable foreign keys: the alternative is a table
 * with one column set and three null on every row, and a CHECK to say so. The
 * cost is that the reference is not enforced by the database, which is why
 * expiry reverts *by subject type* and a subject that has gone leaves nothing
 * behind to revert.
 */
export const RESTRICTABLE = ['definition', 'decision', 'document', 'artifact'] as const;
export type Restrictable = (typeof RESTRICTABLE)[number];

/**
 * Who may see a restricted subject. UI spec §1.6.
 *
 * A role rather than a member list. RCOS §5.3.5 asks for exceptions to be
 * justified, time-bounded and still auditable — not for fine-grained access
 * control, and per-member ACLs would be a second permission system beside the
 * one `docs/04` §1 already has. `stewards` is the honest MVP answer to "who can
 * see it"; a community needing more than that has a governance problem the tool
 * should not paper over.
 */
export const EXCEPTION_AUDIENCES = ['stewards'] as const;
export type ExceptionAudience = (typeof EXCEPTION_AUDIENCES)[number];

/**
 * The one legitimate reason to hide something from a fellow member, as a record.
 * UI spec §1.6, RCOS §5.3.5.
 *
 * Every field here is load-bearing. Without `justification` it is a permission
 * setting; without `audience` "restricted" has no defined reader and the rule
 * that a member sees it only if they may is undefined; without `expiresAt` it
 * never ends, and an exception that never ends is not an exception. `decisionId`
 * is what makes restricting something a governance act rather than an
 * administrative one.
 */
export const transparencyException = sqliteTable(
	'transparency_exception',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		subjectType: text('subject_type', { enum: RESTRICTABLE }).notNull(),
		subjectId: text('subject_id').notNull(),

		/** Who may see it while it is restricted. */
		audience: text('audience', { enum: EXCEPTION_AUDIENCES }).notNull(),
		/** In the community's own words, because an auditor will read it. */
		justification: text('justification').notNull(),
		/** The decision that authorised the restriction. */
		decisionId: text('decision_id'),

		/**
		 * Not nullable, deliberately. An optional expiry becomes a null on every
		 * row within a month, and the object stops being an exception and becomes
		 * a checkbox with extra words.
		 */
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		/** Set when the expiry job reverted it, so history stays readable. */
		expiredAt: integer('expired_at', { mode: 'timestamp_ms' }),
		/** The exception this one renewed, so "why is it still hidden" is answerable. */
		renewsId: text('renews_id'),

		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		/**
		 * One live exception per subject. A second would mean two justifications
		 * and two end dates for one hidden thing, and no answer to which applies.
		 * Partial, so the expired ones accumulate beside it as history.
		 */
		uniqueIndex('transparency_exception_live_idx')
			.on(table.communityId, table.subjectType, table.subjectId)
			.where(sql`${table.expiredAt} is null`),
		index('transparency_exception_expiry_idx').on(table.expiresAt),
		check(
			'transparency_exception_subject_ck',
			sql`${table.subjectType} in ('definition', 'decision', 'document', 'artifact')`
		),
		check('transparency_exception_audience_ck', sql`${table.audience} in ('stewards')`),
		// An exception justified by nothing is the thing this table exists to
		// prevent, and whitespace is nothing.
		check('transparency_exception_justified_ck', sql`length(trim(${table.justification})) > 0`)
	]
);

export type TransparencyException = typeof transparencyException.$inferSelect;

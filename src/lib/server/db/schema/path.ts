import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community } from './tenancy.js';

/**
 * How a community's work is ordered, and who decided it should be.
 * UI spec §4.4.
 *
 * The brief is one sentence: **the ordering rule is a visible, editable,
 * versioned settings object, not hidden logic.** That is why these are rows
 * rather than constants — a community cannot disagree with a number it cannot
 * see, and the tool having an opinion is only honest if the opinion is
 * arguable.
 */

/**
 * The four weights, versioned the way a decision is.
 *
 * One active row per community, with its history beside it. Changing the
 * weights supersedes rather than updates, so "reordered by Ana on 3 September"
 * is answerable and the previous opinion stays readable — an ordering that can
 * be silently retuned is one nobody can audit, including the person who retuned
 * it and forgot.
 */
export const pathWeights = sqliteTable(
	'path_weights',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),

		/**
		 * Structural dependency: a question whose answer depends on one nobody has
		 * written yet gets answered in the dark.
		 *
		 * Deliberately an order of magnitude above the others in the defaults. The
		 * requirement that a community changing nothing sees no change means the
		 * weighted sum has to reproduce P3's lexicographic sort, and that is only
		 * true while this term dominates the rest put together. Someone tuning the
		 * defaults to look tidier would break it silently.
		 */
		dependency: integer('dependency').notNull(),
		/** How much of the standard the gap holds up: how many clauses it answers. */
		severity: integer('severity').notNull(),
		/** What the community told us about itself. */
		risk: integer('risk').notNull(),
		/** What they have already: evidence, discussions, definitions pointing at it. */
		attention: integer('attention').notNull(),

		/** False once a community has tuned them. Lets the screen say "these are ours". */
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(true),
		/** Exactly one row per community is active; the rest are history. */
		active: integer('active', { mode: 'boolean' }).notNull().default(true),

		changedBy: text('changed_by').references(() => user.id, { onDelete: 'set null' }),
		changedAt: integer('changed_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		// One active set per community, enforced where it cannot be forgotten.
		uniqueIndex('path_weights_active_idx')
			.on(table.communityId)
			.where(sql`${table.active} = 1`),
		index('path_weights_history_idx').on(table.communityId, table.changedAt),
		// A negative weight would invert an input rather than silence it, which is
		// not a thing the screen offers or the reasons could explain.
		check(
			'path_weights_range_ck',
			sql`${table.dependency} >= 0 and ${table.severity} >= 0 and ${table.risk} >= 0 and ${table.attention} >= 0`
		)
	]
);

/**
 * Where a community put something by hand.
 *
 * The computed position is kept beside it rather than replaced: an override
 * that erases the computation makes the list unfalsifiable, because nobody can
 * tell afterwards whether the ordering was wrong or the community simply
 * disagreed.
 *
 * `weightsIdAtPlacement` is what lets an item say its placement may be stale.
 * A community that reorders by hand and later retunes has expressed two
 * opinions that can conflict; the override survives, and the item says the
 * ordering moved underneath it. The tool does not quietly discard a deliberate
 * act, and it does not pretend nothing happened.
 */
export const pathOverride = sqliteTable(
	'path_override',
	{
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		/** The section, which is standard-wide; the community makes it theirs. */
		sectionKey: text('section_key').notNull(),
		/** Zero-based, and dense within a community by construction. */
		position: integer('position').notNull(),
		weightsIdAtPlacement: text('weights_id_at_placement').references(() => pathWeights.id, {
			onDelete: 'set null'
		}),
		placedBy: text('placed_by').references(() => user.id, { onDelete: 'set null' }),
		placedAt: integer('placed_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		uniqueIndex('path_override_idx').on(table.communityId, table.sectionKey),
		check('path_override_position_ck', sql`${table.position} >= 0`)
	]
);

/** The five answers. `null` is "not answered yet", which is not the same as "no". */
export const MEETS_VALUES = ['in_person', 'online', 'both'] as const;
export type Meets = (typeof MEETS_VALUES)[number];

/**
 * What a community told us about itself, and nothing more.
 *
 * These describe the people in a community rather than its governance — whether
 * children live on site, whether one person owns the property. They stay inside
 * the community, never reach a model, and never appear on a public surface.
 */
export const riskProfile = sqliteTable(
	'risk_profile',
	{
		communityId: text('community_id')
			.primaryKey()
			.references(() => community.id, { onDelete: 'cascade' }),

		holdsLand: integer('holds_land', { mode: 'boolean' }),
		sharedMoney: integer('shared_money', { mode: 'boolean' }),
		childrenOnSite: integer('children_on_site', { mode: 'boolean' }),
		founderOwner: integer('founder_owner', { mode: 'boolean' }),
		/**
		 * Deliberately not a yes/no. "Only online" is not the absence of meeting in
		 * person — it moves a *different* set of requirements up, and asking it as
		 * a negative would have made an online community's ordering the default
		 * ordering minus some things, which is not what it needs.
		 */
		meets: text('meets', { enum: MEETS_VALUES }),

		updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		// Checked in the database, because drizzle's `text({ enum })` is a
		// TypeScript narrowing and SQLite stores whatever it is handed. P3 learned
		// this from a decision type no screen could render; P4 learned it again.
		check(
			'risk_profile_meets_ck',
			sql`${table.meets} is null or ${table.meets} in ('in_person', 'online', 'both')`
		)
	]
);

export type PathWeights = typeof pathWeights.$inferSelect;
export type PathOverride = typeof pathOverride.$inferSelect;
export type RiskProfile = typeof riskProfile.$inferSelect;

/**
 * The shipped opinion.
 *
 * Dependency dominates because it has to (see the column comment). The other
 * three are of a size with each other, so tuning any one of them visibly moves
 * the list rather than being swamped — and together they can lift an item past
 * one layer boundary, which is what makes "because you hold land, these move
 * up" true rather than decorative.
 */
export const DEFAULT_WEIGHTS = { dependency: 250, severity: 10, risk: 10, attention: 8 } as const;

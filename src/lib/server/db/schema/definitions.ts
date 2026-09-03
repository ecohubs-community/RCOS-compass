import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community, communityStandard } from './tenancy.js';

/**
 * What a community has written down. docs/03-data-model.md §3, §3a.
 *
 * A definition either answers one section of a standard (`scope = standard`) or
 * it is the community's own rule (`scope = local`). Local definitions get the
 * whole lifecycle — versions, drafts, discussions, freeze, review dates — because
 * they are just as binding for the people living there, and treating them as
 * second-class notes is exactly why a community would keep a second document.
 * What they never do is move a number.
 */

/**
 * A community's own artifact, holding definitions the standard never asked for.
 * Every community gets one at creation; more can be added.
 */
export const communityArtifact = sqliteTable(
	'community_artifact',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		layer: integer('layer'),
		order: integer('order').notNull().default(0),
		/** `default` is the *Community Agreements* artifact created with the community. */
		kind: text('kind', { enum: ['default', 'custom'] })
			.notNull()
			.default('custom'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('community_artifact_community_idx').on(table.communityId)]
);

export const definition = sqliteTable(
	'definition',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		scope: text('scope', { enum: ['standard', 'local'] }).notNull(),

		/** Set together, and only for `scope = standard`. */
		communityStandardId: text('community_standard_id').references(() => communityStandard.id, {
			onDelete: 'cascade'
		}),
		sectionKey: text('section_key'),

		/** A local definition names itself; a standard one takes its title from the section. */
		title: text('title'),
		layer: integer('layer'),
		/** Why this rule exists — read in three years when nobody remembers. */
		purpose: text('purpose'),

		/**
		 * Where a local definition hangs. `rcos_artifact` is UI spec §1.4b's "local
		 * extension" — the community saying more inside a section the standard does
		 * define; `community_artifact` is its own rule. Exactly one is set.
		 */
		attachKind: text('attach_kind', { enum: ['rcos_artifact', 'community_artifact'] }),
		attachRcosArtifactKey: text('attach_rcos_artifact_key'),
		attachCommunityArtifactId: text('attach_community_artifact_id').references(
			() => communityArtifact.id,
			{ onDelete: 'cascade' }
		),

		adoptedVersionId: text('adopted_version_id'),
		/** The proposal currently in flight, if any. */
		openProposalId: text('open_proposal_id'),
		reviewDueAt: integer('review_due_at', { mode: 'timestamp_ms' }),
		/** Adopted before the community had a Decision Matrix. docs/03 §7. */
		provisional: integer('provisional', { mode: 'boolean' }).notNull().default(false),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		/**
		 * One answer per standard section — and, because it is partial, as many
		 * local definitions as a community likes. A plain unique index would allow
		 * exactly one row with a null section key, which is the opposite of what
		 * §3a asks for.
		 */
		uniqueIndex('definition_section_idx')
			.on(table.communityStandardId, table.sectionKey)
			.where(sql`${table.sectionKey} is not null`),
		index('definition_community_idx').on(table.communityId),
		index('definition_artifact_idx').on(table.attachCommunityArtifactId),

		// In the schema rather than in a service: these must hold against a bad
		// migration as well as against a bad caller.
		check(
			'definition_scope_section_ck',
			sql`(${table.scope} = 'standard') = (${table.sectionKey} is not null)`
		),
		check(
			'definition_local_attach_ck',
			sql`
				(${table.scope} = 'local') = (${table.attachKind} is not null)
				and (${table.attachKind} is null or (
					(${table.attachKind} = 'rcos_artifact') = (${table.attachRcosArtifactKey} is not null)
					and (${table.attachKind} = 'community_artifact') = (${table.attachCommunityArtifactId} is not null)
				))
			`
		)
	]
);

/**
 * The live draft. One per definition, autosaved, and never what a reader sees —
 * the adopted version stays authoritative until a freeze replaces it.
 */
export const definitionDraft = sqliteTable('definition_draft', {
	definitionId: text('definition_id')
		.primaryKey()
		.references(() => definition.id, { onDelete: 'cascade' }),
	body: text('body').notNull().default(''),
	plainLanguage: text('plain_language'),
	type: text('type', { enum: ['enforceable', 'interpretive', 'expressive'] }),
	/**
	 * Optimistic concurrency. Rotated on every successful save, so a save
	 * presenting the token it loaded with is the only one that wins.
	 */
	editToken: text('edit_token').notNull(),
	updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** Immutable once frozen. The register quotes these, so they never change. */
export const definitionVersion = sqliteTable(
	'definition_version',
	{
		id: text('id').primaryKey(),
		definitionId: text('definition_id')
			.notNull()
			.references(() => definition.id, { onDelete: 'cascade' }),
		/** 1, 2, 3 … within the definition. */
		n: integer('n').notNull(),
		body: text('body').notNull(),
		plainLanguage: text('plain_language'),
		type: text('type', { enum: ['enforceable', 'interpretive', 'expressive'] }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		/** How it was written, kept with the text rather than inferred later. */
		aiAssisted: integer('ai_assisted', { mode: 'boolean' }).notNull().default(false),
		aiTask: text('ai_task'),
		linterResult: text('linter_result', { mode: 'json' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		adoptedAt: integer('adopted_at', { mode: 'timestamp_ms' }),
		decisionId: text('decision_id'),
		supersedesVersionId: text('supersedes_version_id')
	},
	(table) => [
		uniqueIndex('definition_version_n_idx').on(table.definitionId, table.n),
		index('definition_version_definition_idx').on(table.definitionId)
	]
);

/**
 * Which definition answers which clause. Derived, rebuilt when a version is
 * adopted — and the unique key is the one-owning-definition-per-clause rule made
 * physical (docs/03 §4, "the single most important invariant in the pipeline").
 *
 * It exists so readiness is a count over an indexed table rather than a walk over
 * every definition asking the standard what it owns.
 */
export const clauseCoverage = sqliteTable(
	'clause_coverage',
	{
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		communityStandardId: text('community_standard_id')
			.notNull()
			.references(() => communityStandard.id, { onDelete: 'cascade' }),
		clauseKey: text('clause_key').notNull(),
		definitionId: text('definition_id')
			.notNull()
			.references(() => definition.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('clause_coverage_idx').on(table.communityStandardId, table.clauseKey),
		index('clause_coverage_definition_idx').on(table.definitionId)
	]
);

/**
 * What a community wished the standard had asked for. UI spec §1.4b kind 3.
 *
 * Captured from day one because you cannot retroactively collect it, and shared
 * upstream only by a deliberate act — there is no automatic channel.
 */
export const standardFeedback = sqliteTable(
	'standard_feedback',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		definitionId: text('definition_id').references(() => definition.id, { onDelete: 'set null' }),
		clauseKey: text('clause_key'),
		standardId: text('standard_id').notNull(),
		version: text('version').notNull(),
		kind: text('kind', { enum: ['gap', 'ambiguity', 'conflict', 'suggestion'] }).notNull(),
		body: text('body').notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		/** Opt-in, never automatic. */
		sharedUpstream: integer('shared_upstream', { mode: 'boolean' }).notNull().default(false)
	},
	(table) => [index('standard_feedback_community_idx').on(table.communityId)]
);

export type Definition = typeof definition.$inferSelect;
export type DefinitionVersion = typeof definitionVersion.$inferSelect;
export type DefinitionDraft = typeof definitionDraft.$inferSelect;
export type CommunityArtifact = typeof communityArtifact.$inferSelect;

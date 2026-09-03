import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import {
	communityArtifact,
	definition,
	definitionDraft,
	definitionVersion,
	standardFeedback,
	type Definition
} from '../db/schema/definitions.js';
import { communityStandard } from '../db/schema/tenancy.js';
import { registerTenantService } from './registry.js';

/**
 * What a community has written down. docs/03-data-model.md §3a, UI spec §1.4b.
 *
 * The distinction this module exists to keep straight: a **standard** definition
 * answers one section of RCOS and moves a number; a **local** one is the
 * community's own rule and moves none, in either direction. Local definitions
 * get everything else — versions, drafts, discussions, freeze, review dates —
 * because they are just as binding for the people living there, and treating
 * them as second-class notes is exactly why a community would keep a second
 * document.
 */

/** A community's active standard. Everything scoped to RCOS hangs off it. */
function activeStandard(db: Db, communityId: string) {
	return db
		.select()
		.from(communityStandard)
		.where(
			and(eq(communityStandard.communityId, communityId), eq(communityStandard.status, 'active'))
		)
		.get();
}

/**
 * Find a definition inside the caller's community, or behave as though it does
 * not exist. The community comes from `ctx`, never from the caller — which is
 * what makes reaching across the boundary structurally impossible rather than
 * merely checked (docs/04-security.md §2).
 */
export function getDefinition(
	ctx: Ctx,
	definitionId: string,
	options: { db?: Db } = {}
): Definition {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(definition)
		.where(and(eq(definition.id, definitionId), eq(definition.communityId, ctx.community.id)))
		.get();

	if (!found) error(404, 'Not found');
	return found;
}

export type CreateStandardDefinition = {
	scope: 'standard';
	sectionKey: string;
};

export type CreateLocalDefinition = {
	scope: 'local';
	title: string;
	purpose?: string;
	layer?: number;
	/** Its own rule, or more to say inside an artifact RCOS does define. */
	attach:
		| { kind: 'community_artifact'; artifactId: string }
		| { kind: 'rcos_artifact'; artifactKey: string };
	/** UI spec §1.4b kind 3: "RCOS should require this." */
	standardShouldRequireThis?: boolean;
};

export function createDefinition(
	ctx: Ctx,
	input: CreateStandardDefinition | CreateLocalDefinition,
	options: { db?: Db } = {}
): Definition {
	requirePermission(ctx, 'definition.draft');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();

	const standard = activeStandard(db, ctx.community.id);
	if (!standard) error(409, 'This community has not adopted a standard yet.');

	return db.transaction((tx) => {
		const row = {
			id: newId(),
			communityId: ctx.community.id,
			adoptedVersionId: null,
			openProposalId: null,
			reviewDueAt: null,
			provisional: false,
			createdBy: ctx.user.id,
			createdAt: new Date(now),
			updatedAt: new Date(now)
		};

		let values: typeof definition.$inferInsert;

		if (input.scope === 'standard') {
			// One answer per section. The partial unique index would refuse a second
			// anyway; asking first means the member is handed the existing
			// definition rather than an error about an index.
			const existing = tx
				.select()
				.from(definition)
				.where(
					and(
						eq(definition.communityStandardId, standard.id),
						eq(definition.sectionKey, input.sectionKey)
					)
				)
				.get();
			if (existing) {
				error(409, 'This section already has a definition. Open it and propose a change instead.');
			}

			values = {
				...row,
				scope: 'standard',
				communityStandardId: standard.id,
				sectionKey: input.sectionKey,
				title: null,
				layer: null,
				purpose: null,
				attachKind: null,
				attachRcosArtifactKey: null,
				attachCommunityArtifactId: null
			};
		} else {
			if (input.attach.kind === 'community_artifact') {
				// The artifact must be this community's. A definition hanging from
				// another community's shelf would be a cross-tenant write.
				const artifact = tx
					.select()
					.from(communityArtifact)
					.where(
						and(
							eq(communityArtifact.id, input.attach.artifactId),
							eq(communityArtifact.communityId, ctx.community.id)
						)
					)
					.get();
				if (!artifact) error(404, 'Not found');
			}

			values = {
				...row,
				scope: 'local',
				communityStandardId: null,
				sectionKey: null,
				title: input.title.trim(),
				layer: input.layer ?? null,
				purpose: input.purpose?.trim() || null,
				attachKind: input.attach.kind,
				attachRcosArtifactKey:
					input.attach.kind === 'rcos_artifact' ? input.attach.artifactKey : null,
				attachCommunityArtifactId:
					input.attach.kind === 'community_artifact' ? input.attach.artifactId : null
			};
		}

		tx.insert(definition).values(values).run();

		// A definition starts with an empty draft, so there is somewhere to type
		// without a separate "start writing" step.
		tx.insert(definitionDraft)
			.values({
				definitionId: values.id!,
				body: '',
				plainLanguage: null,
				type: null,
				editToken: newEditToken(),
				updatedBy: ctx.user.id,
				updatedAt: new Date(now)
			})
			.run();

		if (input.scope === 'local' && input.standardShouldRequireThis) {
			// Captured from day one: you cannot retroactively collect "what did
			// communities wish the standard had asked for". Nothing is sent
			// anywhere — sharing upstream is a separate, deliberate act.
			tx.insert(standardFeedback)
				.values({
					id: newId(),
					communityId: ctx.community.id,
					definitionId: values.id!,
					clauseKey: null,
					standardId: standard.standardId,
					version: standard.version,
					kind: 'gap',
					body: input.title.trim(),
					createdBy: ctx.user.id,
					createdAt: new Date(now),
					sharedUpstream: false
				})
				.run();
		}

		return tx.select().from(definition).where(eq(definition.id, values.id!)).get()!;
	});
}

/** Everything hanging off one of the community's own artifacts. */
export function listLocalDefinitions(
	ctx: Ctx,
	artifactId: string,
	options: { db?: Db } = {}
): Definition[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const artifact = db
		.select()
		.from(communityArtifact)
		.where(
			and(eq(communityArtifact.id, artifactId), eq(communityArtifact.communityId, ctx.community.id))
		)
		.get();
	if (!artifact) error(404, 'Not found');

	return db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				eq(definition.attachCommunityArtifactId, artifactId)
			)
		)
		.all();
}

// --- Drafts ---------------------------------------------------------------

export function newEditToken(): string {
	return randomBytes(16).toString('base64url');
}

export type DraftView = {
	definitionId: string;
	body: string;
	plainLanguage: string | null;
	type: 'enforceable' | 'interpretive' | 'expressive' | null;
	editToken: string;
	updatedBy: string | null;
	updatedAt: number;
};

export function getDraft(ctx: Ctx, definitionId: string, options: { db?: Db } = {}): DraftView {
	getDefinition(ctx, definitionId, options);
	const db = options.db ?? getDb();

	const draft = db
		.select()
		.from(definitionDraft)
		.where(eq(definitionDraft.definitionId, definitionId))
		.get();
	if (!draft) error(404, 'Not found');

	return { ...draft, updatedAt: draft.updatedAt.getTime() };
}

/** What a second editor is told instead of losing their work. */
export class StaleDraftError extends Error {
	constructor(readonly current: DraftView) {
		super('This draft changed while you were editing it.');
		this.name = 'StaleDraftError';
	}
}

/**
 * Autosave. The token the editor loaded with is the only one that wins.
 *
 * Silent last-write-wins on governance text is a bug a community notices only
 * after quoting the wrong version, so a stale save is refused and the editor is
 * handed what is actually there — who wrote it and when — to decide between
 * keeping theirs, taking the other, or merging by hand (docs/01 §1).
 */
export function saveDraft(
	ctx: Ctx,
	input: {
		definitionId: string;
		editToken: string;
		body: string;
		plainLanguage?: string | null;
		type?: 'enforceable' | 'interpretive' | 'expressive' | null;
	},
	options: { db?: Db } = {}
): DraftView {
	requirePermission(ctx, 'definition.draft');
	requireWritableCommunity(ctx);
	getDefinition(ctx, input.definitionId, options);

	const db = options.db ?? getDb();
	const now = ctx.now();
	const nextToken = newEditToken();

	return db.transaction((tx) => {
		const current = tx
			.select()
			.from(definitionDraft)
			.where(eq(definitionDraft.definitionId, input.definitionId))
			.get();
		if (!current) error(404, 'Not found');

		if (current.editToken !== input.editToken) {
			throw new StaleDraftError({ ...current, updatedAt: current.updatedAt.getTime() });
		}

		tx.update(definitionDraft)
			.set({
				body: input.body,
				plainLanguage: input.plainLanguage ?? current.plainLanguage,
				type: input.type ?? current.type,
				editToken: nextToken,
				updatedBy: ctx.user.id,
				updatedAt: new Date(now)
			})
			.where(eq(definitionDraft.definitionId, input.definitionId))
			.run();

		tx.update(definition)
			.set({ updatedAt: new Date(now) })
			.where(eq(definition.id, input.definitionId))
			.run();

		return {
			definitionId: input.definitionId,
			body: input.body,
			plainLanguage: input.plainLanguage ?? current.plainLanguage,
			type: input.type ?? current.type,
			editToken: nextToken,
			updatedBy: ctx.user.id,
			updatedAt: now
		};
	});
}

/** The adopted text, or null while a definition has never been frozen. */
export function adoptedVersion(ctx: Ctx, definitionId: string, options: { db?: Db } = {}) {
	const found = getDefinition(ctx, definitionId, options);
	if (!found.adoptedVersionId) return null;

	const db = options.db ?? getDb();
	return (
		db
			.select()
			.from(definitionVersion)
			.where(
				and(
					eq(definitionVersion.id, found.adoptedVersionId),
					eq(definitionVersion.definitionId, definitionId)
				)
			)
			.get() ?? null
	);
}

/** Definitions this community has not yet frozen anything for. */
export function unansweredDefinitions(ctx: Ctx, options: { db?: Db } = {}): Definition[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	return db
		.select()
		.from(definition)
		.where(and(eq(definition.communityId, ctx.community.id), isNull(definition.adoptedVersionId)))
		.all();
}

registerTenantService({ name: 'definitions.get', subject: 'definition', call: getDefinition });
registerTenantService({ name: 'definitions.draft', subject: 'definition', call: getDraft });
registerTenantService({
	name: 'definitions.adoptedVersion',
	subject: 'definition',
	call: adoptedVersion
});
registerTenantService({
	name: 'definitions.listLocal',
	subject: 'communityArtifact',
	call: listLocalDefinitions
});

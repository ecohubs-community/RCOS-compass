import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { communityOf, type Reader } from '../auth/audience.js';
import { requireRead, visibleTo } from '../auth/visible-to.js';
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
import { changeLog } from '../db/schema/decisions.js';
import { communityStandard } from '../db/schema/tenancy.js';
import { indexDefinition } from './search.js';
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
	reader: Reader,
	definitionId: string,
	options: { db?: Db } = {}
): Definition {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.id, definitionId),
				eq(definition.communityId, communityOf(audience)),
				visibleTo(audience, definition.visibility)
			)
		)
		.get();

	// The same answer as for a definition that does not exist. Saying "you may
	// not see this" would confirm that it does, which is the disclosure the
	// visibility level was chosen to prevent.
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
	reader: Reader,
	artifactId: string,
	options: { db?: Db } = {}
): Definition[] {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();

	const artifact = db
		.select()
		.from(communityArtifact)
		.where(
			and(
				eq(communityArtifact.id, artifactId),
				eq(communityArtifact.communityId, communityOf(audience)),
				visibleTo(audience, communityArtifact.visibility)
			)
		)
		.get();
	if (!artifact) error(404, 'Not found');

	return db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, communityOf(audience)),
				eq(definition.attachCommunityArtifactId, artifactId),
				visibleTo(audience, definition.visibility)
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

		// Absent means "unchanged"; an explicit null means "cleared". `??` read
		// them as the same thing, so deleting the plain-language mirror wrote the
		// old one straight back and it reappeared on the next load.
		const plainLanguage =
			'plainLanguage' in input ? (input.plainLanguage ?? null) : current.plainLanguage;
		const type = 'type' in input ? (input.type ?? null) : current.type;

		tx.update(definitionDraft)
			.set({
				body: input.body,
				plainLanguage,
				type,
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
			plainLanguage,
			type,
			editToken: nextToken,
			updatedBy: ctx.user.id,
			updatedAt: now
		};
	});
}

/**
 * Correcting adopted text without rewriting what it replaces.
 * `docs/03-data-model.md` §10.
 *
 * The flow that already exists — draft, freeze, supersede — is how a community
 * *changes its mind*, and it goes through a decision because that is what
 * changing a rule is. This is the other case: the rule is the same and the words
 * are wrong. A misspelled street, a number transposed, a name that should never
 * have been typed into it.
 *
 * So it makes a new version carrying a reason, points the definition at it, and
 * leaves the superseded one exactly where it was. Nothing is destroyed, which is
 * what separates it from a redaction — and it is why a correction is not enough
 * on its own when somebody asks to be forgotten.
 */
export function correctDefinition(
	ctx: Ctx,
	input: { definitionId: string; body: string; reason: string },
	options: { db?: Db } = {}
): string {
	requirePermission(ctx, 'definition.ratify');
	requireWritableCommunity(ctx);

	const body = input.body.trim();
	if (!body) error(400, 'A correction needs the corrected text.');
	const reason = input.reason.trim();
	if (!reason) error(400, 'Say why this is being corrected.');

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());
	const id = newId();

	db.transaction((tx) => {
		const row = tx
			.select()
			.from(definition)
			.where(
				and(eq(definition.id, input.definitionId), eq(definition.communityId, ctx.community.id))
			)
			.get();
		if (!row?.adoptedVersionId) error(404, 'Not found');

		const current = tx
			.select()
			.from(definitionVersion)
			.where(eq(definitionVersion.id, row.adoptedVersionId))
			.get()!;

		tx.insert(definitionVersion)
			.values({
				id,
				definitionId: row.id,
				n: current.n + 1,
				body,
				plainLanguage: current.plainLanguage,
				type: current.type,
				authorId: ctx.user.id,
				aiAssisted: false,
				aiTask: null,
				linterResult: null,
				createdAt: now,
				adoptedAt: now,
				// The decision that adopted the text is carried forward: the
				// community agreed to the rule, and a correction does not re-open it.
				decisionId: current.decisionId,
				supersedesVersionId: current.id
			})
			.run();

		tx.update(definition)
			.set({ adoptedVersionId: id, updatedAt: now })
			.where(eq(definition.id, row.id))
			.run();

		indexDefinition(tx as unknown as Db, ctx.community.id, row.id);

		tx.insert(changeLog)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				at: now,
				actorId: ctx.user.id,
				kind: 'definition.corrected',
				subjectType: 'definition',
				subjectId: row.id,
				summary: reason,
				payload: null
			})
			.run();
	});

	return id;
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
registerTenantService({
	name: 'definitions.saveDraft',
	subject: 'definition',
	// A foreign definition has to be refused before the edit token is even looked
	// at, so the token here is deliberately one that could never be right.
	call: (ctx, subjectId) =>
		saveDraft(ctx, { definitionId: subjectId, editToken: 'not-a-token', body: 'x' })
});

/** Every standard definition this community holds, keyed by section. */
export function definitionsBySection(
	reader: Reader,
	options: { db?: Db } = {}
): Map<string, Definition> {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();

	return new Map(
		db
			.select()
			.from(definition)
			.where(
				and(
					eq(definition.communityId, communityOf(audience)),
					eq(definition.scope, 'standard'),
					visibleTo(audience, definition.visibility)
				)
			)
			.all()
			.map((row) => [row.sectionKey!, row])
	);
}

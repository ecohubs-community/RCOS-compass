import { and, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { ctxCan, requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { decision } from '../db/schema/decisions.js';
import { definition, definitionVersion, localDefinitionTouch } from '../db/schema/definitions.js';
import { consentRound, discussion, post } from '../db/schema/discussions.js';
import { evidence } from '../db/schema/documents.js';
import { definitionStatus, type DerivedStatus } from '../../shared/definition-status.js';
import type { StandardView } from '../standard/index.js';
import { activeStandardView, sectionOf } from './completeness.js';
import { getDefinition } from './definitions.js';
import { compareRefs, questionFor } from './requirement.js';

/**
 * How a community got to a rule: the reads behind the definition page's
 * "How we got here" column (UI spec §4.3 — "provenance is never more than one
 * glance away from the rule itself").
 *
 * Each read is tested on its own so the column cannot drift from the register.
 * Every one starts from `getDefinition`, which answers 404 for another
 * community's definition and for a restricted one the reader may not see, so
 * none of them can be a way around visibility (`provenance-ui` D14).
 */

/** Discussions about a definition: opened on it, or answering its section. */
export type DefinitionDiscussion = {
	id: string;
	title: string;
	status: string;
	openedAt: number;
	lastActivityAt: number;
	messages: number;
};

/**
 * By `definitionId`, or by `sectionOf` — the thread's section, else its clause's
 * owner — the rule the Path and the freeze use, so a thread is never listed on
 * one definition and frozen into another (`provenance-ui` D1). A thread opened
 * on a clause or a section keeps `definitionId = null` after its freeze creates
 * the definition, which is why the second half exists.
 */
export function discussionsForDefinition(
	ctx: Ctx,
	definitionId: string,
	options: { db?: Db } = {}
): DefinitionDiscussion[] {
	const db = options.db ?? getDb();
	const found = getDefinition(ctx, definitionId, { db });
	const standard = activeStandardView(db, ctx);

	const threads = db
		.select()
		.from(discussion)
		.where(eq(discussion.communityId, ctx.community.id))
		.all()
		.filter(
			(thread) =>
				thread.definitionId === found.id ||
				(found.sectionKey !== null &&
					standard !== null &&
					thread.definitionId === null &&
					sectionOf(standard.view, thread) === found.sectionKey)
		);
	if (threads.length === 0) return [];

	const messages = new Map(
		db
			.select({ discussionId: post.discussionId, n: count() })
			.from(post)
			.where(
				and(
					inArray(
						post.discussionId,
						threads.map((thread) => thread.id)
					),
					eq(post.kind, 'message')
				)
			)
			.groupBy(post.discussionId)
			.all()
			.map((row) => [row.discussionId, row.n])
	);

	return threads
		.map((thread) => ({
			id: thread.id,
			title: thread.title,
			status: thread.status,
			openedAt: thread.openedAt.getTime(),
			lastActivityAt: thread.lastActivityAt.getTime(),
			messages: messages.get(thread.id) ?? 0
		}))
		.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

/** The decision behind a version, as the column shows it. */
export type VersionDecision = {
	ref: string;
	title: string;
	mechanism: string;
	threshold: string | null;
	tallyPresent: number | null;
	tallyFor: number | null;
	tallyAgainst: number | null;
	unresolvedObjections: number;
	decidedAt: number;
	reviewDueAt: number | null;
	provisional: boolean;
};

export type DefinitionVersionRow = {
	n: number;
	adoptedAt: number | null;
	current: boolean;
	decision: VersionDecision | null;
};

/** Every adopted version, newest first, each with the decision that adopted it. */
export function definitionVersions(
	ctx: Ctx,
	definitionId: string,
	options: { db?: Db } = {}
): DefinitionVersionRow[] {
	const db = options.db ?? getDb();
	const found = getDefinition(ctx, definitionId, { db });

	return db
		.select({ version: definitionVersion, decision })
		.from(definitionVersion)
		.leftJoin(
			decision,
			and(eq(decision.id, definitionVersion.decisionId), eq(decision.communityId, ctx.community.id))
		)
		.where(
			and(eq(definitionVersion.definitionId, found.id), isNotNull(definitionVersion.adoptedAt))
		)
		.orderBy(desc(definitionVersion.n))
		.all()
		.map(({ version, decision: d }) => ({
			n: version.n,
			adoptedAt: version.adoptedAt?.getTime() ?? null,
			current: version.id === found.adoptedVersionId,
			decision: d && {
				ref: d.ref,
				title: d.title,
				mechanism: d.mechanism,
				threshold: d.threshold,
				tallyPresent: d.tallyPresent,
				tallyFor: d.tallyFor,
				tallyAgainst: d.tallyAgainst,
				unresolvedObjections: d.unresolvedObjections,
				decidedAt: d.decidedAt.getTime(),
				reviewDueAt: d.reviewDueAt?.getTime() ?? null,
				provisional: d.provisional
			}
		}));
}

/** A neighbour in the standard, and whether this community has written it. */
export type RelatedDefinition = {
	sectionKey: string;
	title: string;
	question: string;
	/** The section's first owned clause ref, for the "not written yet" link. */
	ref: string | null;
	definitionId: string | null;
	adopted: boolean;
	/** Why it is related: it cites this one, this one cites it, or one waits on the other. */
	why: 'cites' | 'cited' | 'depends';
};

/**
 * Related definitions, from the standard's own references (`provenance-ui` D3):
 * sections that cite a clause this one owns, owners of clauses this one only
 * cites, and the Path's `dependsOn` in both directions. For a local definition,
 * the owners of the clauses it says it touches. Each resolved to this
 * community's definition when one exists and the reader may see it.
 */
export function relatedDefinitions(
	ctx: Ctx,
	definitionId: string,
	options: { db?: Db } = {}
): RelatedDefinition[] {
	const db = options.db ?? getDb();
	const found = getDefinition(ctx, definitionId, { db });
	const standard = activeStandardView(db, ctx);
	if (!standard) return [];
	const { view } = standard;

	const related = new Map<string, RelatedDefinition['why']>();
	const add = (key: string | null | undefined, why: RelatedDefinition['why']) => {
		if (key && key !== found.sectionKey && !related.has(key)) related.set(key, why);
	};

	if (found.sectionKey) {
		const section = view.section(found.sectionKey);
		for (const clause of view.clauses.filter((c) => c.owner === found.sectionKey))
			for (const citing of clause.referencedBy) add(citing, 'cites');
		for (const ref of section?.clauseRefs ?? []) add(view.clauseByRef(ref)?.owner, 'cited');
		for (const dependency of view.annotation(found.sectionKey)?.dependsOn ?? [])
			add(dependency, 'depends');
		for (const key of view.annotatedSectionKeys)
			if (view.annotation(key)?.dependsOn.includes(found.sectionKey)) add(key, 'depends');
	} else {
		for (const touch of db
			.select()
			.from(localDefinitionTouch)
			.where(eq(localDefinitionTouch.definitionId, found.id))
			.all())
			add(view.clause(touch.clauseKey)?.owner, 'cited');
	}

	const keys = [...related.keys()].filter((key) => view.section(key)?.disposition === 'authored');
	if (keys.length === 0) return [];
	const answering = visibleDefinitionsBySection(ctx, standard.row.id, keys, db);

	return keys.map((key) => {
		const section = view.section(key)!;
		const row = answering.get(key);
		return {
			sectionKey: key,
			title: view.localise(section.i18n, ctx.community.locale).value.title,
			question: questionFor(view, key, ctx.community.locale),
			ref: ownedRefs(view, key)[0] ?? null,
			definitionId: row?.id ?? null,
			adopted: row?.adoptedVersionId != null,
			why: related.get(key)!
		};
	});
}

/** Confirmed evidence for the clauses a definition's section owns. Stale evidence is not shown. */
export type DefinitionEvidence = {
	id: string;
	quote: string;
	documentId: string | null;
	passageId: string | null;
	clauseRef: string;
	confirmedAt: number | null;
};

export function evidenceForDefinition(
	ctx: Ctx,
	definitionId: string,
	options: { db?: Db } = {}
): DefinitionEvidence[] {
	const db = options.db ?? getDb();
	const found = getDefinition(ctx, definitionId, { db });
	const standard = activeStandardView(db, ctx);
	if (!standard || !found.sectionKey) return [];
	const clauses = standard.view.clauses.filter((clause) => clause.owner === found.sectionKey);
	if (clauses.length === 0) return [];
	const refOf = new Map(clauses.map((clause) => [clause.key, clause.ref]));

	return db
		.select()
		.from(evidence)
		.where(
			and(
				eq(evidence.communityId, ctx.community.id),
				eq(evidence.communityStandardId, standard.row.id),
				eq(evidence.state, 'confirmed'),
				inArray(
					evidence.clauseKey,
					clauses.map((clause) => clause.key)
				)
			)
		)
		.all()
		.map((row) => ({
			id: row.id,
			quote: row.quote,
			documentId: row.documentId,
			passageId: row.passageId,
			clauseRef: refOf.get(row.clauseKey)!,
			confirmedAt: row.confirmedAt?.getTime() ?? null
		}))
		.sort((a, b) => compareRefs(a.clauseRef, b.clauseRef));
}

/**
 * Derived status for many sections at once — the Standard browser's 94 rows, the
 * index's every row — in a fixed number of queries, never one per definition
 * (`provenance-ui` D14). Keyed by section; local definitions by definition id.
 */
export function statusesBySection(
	ctx: Ctx,
	options: { db?: Db } = {}
): Map<string, DerivedStatus & { definitionId: string | null; provisional: boolean }> {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const standard = activeStandardView(db, ctx);
	const out = new Map<
		string,
		DerivedStatus & { definitionId: string | null; provisional: boolean }
	>();
	if (!standard) return out;
	const now = ctx.now();

	const definitions = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				eq(definition.communityStandardId, standard.row.id)
			)
		)
		.all();
	const open = db
		.select()
		.from(discussion)
		.where(and(eq(discussion.communityId, ctx.community.id), eq(discussion.status, 'open')))
		.all();
	const openRounds = new Set(
		db
			.select({ proposalPostId: consentRound.proposalPostId })
			.from(consentRound)
			.where(and(eq(consentRound.communityId, ctx.community.id), eq(consentRound.status, 'open')))
			.all()
			.map((row) => row.proposalPostId)
	);

	const byId = new Map(definitions.map((row) => [row.id, row]));
	const threadsBySection = new Map<string, { round: boolean }[]>();
	for (const thread of open) {
		const sectionKey = thread.definitionId
			? (byId.get(thread.definitionId)?.sectionKey ?? null)
			: sectionOf(standard.view, thread);
		if (!sectionKey) continue;
		const round = thread.currentProposalPostId
			? openRounds.has(thread.currentProposalPostId)
			: false;
		threadsBySection.set(sectionKey, [...(threadsBySection.get(sectionKey) ?? []), { round }]);
	}

	const sections = new Set([
		...definitions.map((row) => row.sectionKey).filter((key): key is string => key !== null),
		...threadsBySection.keys()
	]);
	const bySection = new Map(definitions.map((row) => [row.sectionKey, row]));
	for (const sectionKey of sections) {
		const row = bySection.get(sectionKey);
		const threads = threadsBySection.get(sectionKey) ?? [];
		out.set(sectionKey, {
			...definitionStatus(
				{
					exists: row !== undefined,
					adopted: row?.adoptedVersionId != null,
					openDiscussion: threads.length > 0,
					openRound: threads.some((thread) => thread.round),
					reviewDueAt: row?.reviewDueAt?.getTime() ?? null
				},
				now
			),
			definitionId: row?.id ?? null,
			provisional: row?.provisional ?? false
		});
	}
	return out;
}

function ownedRefs(view: StandardView, sectionKey: string): string[] {
	return view.clauses
		.filter((clause) => clause.owner === sectionKey)
		.map((clause) => clause.ref)
		.sort(compareRefs);
}

/** This community's definitions for these sections, minus any the reader may not see. */
function visibleDefinitionsBySection(
	ctx: Ctx,
	communityStandardId: string,
	sectionKeys: string[],
	db: Db
) {
	const rows = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				eq(definition.communityStandardId, communityStandardId),
				inArray(definition.sectionKey, sectionKeys)
			)
		)
		.all()
		// `exception.read`, the capability `visibleTo` reads, not a role.
		.filter((row) => row.visibility !== 'restricted' || ctxCan(ctx, 'exception.read'));
	return new Map(rows.map((row) => [row.sectionKey!, row]));
}

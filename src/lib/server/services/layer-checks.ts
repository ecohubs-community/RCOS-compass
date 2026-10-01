import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { definition, definitionVersion } from '../db/schema/definitions.js';
import { transparencyException } from '../db/schema/visibility.js';
import type { StandardView } from '../standard/index.js';
import { activeStandardView, answeredSections, progressOf } from './completeness.js';
import { compareRefs } from './requirement.js';

/**
 * Whether each layer's artifacts are what the standard says artifacts must be.
 *
 * Every layer of RCOS-Core ends with the same three clauses: which artifacts are
 * mandatory (x.y.1), what every one of them must be (x.y.2 — explicit,
 * versioned, accessible to all members, adopted through a governance process,
 * maintained), and that missing or ambiguous ones cost compliance (x.y.3). All
 * of x.y.2 and x.y.3 are `satisfied_by_platform`, so no community writes an
 * answer to them and the Path never asks. This is where they are *shown*.
 *
 * Computed on read from what Compass already records. Nothing here is stored
 * and nobody ticks a box: a box next to a fact the application can compute is
 * a second source of truth that can disagree with the first.
 *
 * Mostly it informs. Compliance fails on an incomplete mandatory artifact, on a
 * provisional definition, and — decided 2026-10-01 — on a restricted
 * definition in a layer that allows no exception (`restrictedInClosedLayers`,
 * read by `compliance()`, the outward claim and the self-audit). The other
 * properties are shown, not enforced.
 */

export type Property =
	'complete' | 'versioned' | 'accessible' | 'ratified' | 'explicit' | 'maintained';

export type CheckResult = 'met' | 'not_met' | 'attention' | 'nothing_adopted' | 'human';

/** Why an item is listed. The page words it, so the copy is translatable. */
export type Reason =
	| 'incomplete'
	| 'version_missing'
	| 'restricted_no_exceptions'
	| 'restricted_without_exception'
	| 'restricted_with_exception'
	| 'no_decision'
	| 'provisional'
	| 'linter_findings'
	| 'never_linted'
	| 'no_review_date'
	| 'review_overdue';

export type CheckItem = {
	title: string;
	/** Null for an artifact, which has no page of its own here. */
	definitionId: string | null;
	reason: Reason;
	/** Exception end, or review due date — epoch ms, formatted by the page. */
	at?: number;
	/** For `incomplete`. */
	answered?: number;
	authored?: number;
};

export type LayerCheck = {
	property: Property;
	result: CheckResult;
	/** Clause refs this check answers, in the standard's order. */
	refs: string[];
	/** Accessibility in a layer that allows bounded exceptions. */
	allowsExceptions?: boolean;
	/** For `explicit`: adopted definitions with open findings, or never linted. */
	needsReading?: number;
	items: CheckItem[];
};

export type LayerChecks = { layer: number; name: string; checks: LayerCheck[] };

type Rule = { properties: Exclude<Property, 'complete'>[]; exceptions: boolean };

/**
 * What each layer's "artifacts MUST be" clause names, by stable key.
 *
 * Written down rather than parsed from the clause text, which would break on the
 * first translation or rewording. The layers differ: Layer 2 does not name
 * adoption, Layer 5 adds upkeep, and only Layers 3–6 allow "explicit, bounded"
 * exceptions to accessibility. A layer with no entry here shows only
 * completeness — a module or a later version degrades to less, never to a guess.
 */
export const ARTIFACT_RULES: Record<string, Rule> = {
	'l0.artifacts.2': { properties: ['accessible', 'versioned', 'ratified'], exceptions: false },
	'l1.artifacts.2': { properties: ['explicit', 'versioned', 'accessible'], exceptions: false },
	'l2.artifacts.2': { properties: ['explicit', 'versioned', 'accessible'], exceptions: false },
	'l3.artifacts.2': {
		properties: ['explicit', 'versioned', 'accessible', 'ratified'],
		exceptions: true
	},
	'l4.artifacts.2': {
		properties: ['explicit', 'versioned', 'accessible', 'ratified'],
		exceptions: true
	},
	'l5.artifacts.2': {
		properties: ['explicit', 'versioned', 'accessible', 'maintained'],
		exceptions: true
	},
	'l6.artifacts.2': {
		properties: ['explicit', 'versioned', 'accessible', 'ratified'],
		exceptions: true
	}
};

/** The x.y.1 / x.y.2 / x.y.3 clauses of a layer: its spec section titled "Artifacts". */
function artifactClauses(view: StandardView, layer: number) {
	return view.clauses
		.filter((clause) => clause.layer === layer && clause.specSection?.title === 'Artifacts')
		.sort((a, b) => compareRefs(a.ref, b.ref));
}

/** The layers whose artifact rule allows no exception to member access (0–2 in core 0.1). */
export function closedLayers(view: StandardView): Set<number> {
	return new Set(
		view.meta.layers
			.map(({ n }) => n)
			.filter((layer) =>
				artifactClauses(view, layer).some(
					(clause) => ARTIFACT_RULES[clause.key]?.exceptions === false
				)
			)
	);
}

/**
 * Adopted definitions members cannot read, in a layer that allows no exception.
 *
 * The one check that decides compliance (§2.5.3, §3.8.3, §4.7.3: a Layer 0–2
 * artifact that is missing, ambiguous or violated costs it). One function,
 * because `compliance()`, the outward claim and the self-audit each compute
 * compliance, and three copies of this condition could disagree about it.
 * No permission check: each caller has already passed its own.
 */
export function restrictedInClosedLayers(
	db: Db,
	communityId: string,
	communityStandardId: string,
	view: StandardView
): { definitionId: string; sectionKey: string; layer: number }[] {
	const closed = closedLayers(view);
	if (closed.size === 0) return [];
	return db
		.select({ id: definition.id, sectionKey: definition.sectionKey })
		.from(definition)
		.where(
			and(
				eq(definition.communityId, communityId),
				eq(definition.communityStandardId, communityStandardId),
				eq(definition.scope, 'standard'),
				eq(definition.visibility, 'restricted'),
				isNotNull(definition.adoptedVersionId)
			)
		)
		.all()
		.flatMap((row) => {
			const section = row.sectionKey ? view.section(row.sectionKey) : undefined;
			const layer = section ? view.artifact(section.artifact)?.layer : undefined;
			return layer !== undefined && layer !== null && closed.has(layer)
				? [{ definitionId: row.id, sectionKey: row.sectionKey!, layer }]
				: [];
		});
}

export function layerChecks(ctx: Ctx, options: { db?: Db } = {}): LayerChecks[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const standard = activeStandardView(db, ctx);
	if (!standard) return [];
	const { view } = standard;
	const now = ctx.now();
	const locale = ctx.community.locale;

	const answered = answeredSections(db, standard.row.id);

	// Every adopted, standard-scope definition with its adopted version: one query.
	const adopted = db
		.select({ definition, version: definitionVersion })
		.from(definition)
		.innerJoin(definitionVersion, eq(definitionVersion.id, definition.adoptedVersionId))
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				eq(definition.communityStandardId, standard.row.id),
				eq(definition.scope, 'standard'),
				isNotNull(definition.adoptedVersionId)
			)
		)
		.all();
	// An adopted pointer whose version row is gone is the one way "versioned" fails.
	const adoptedIds = new Set(adopted.map((row) => row.definition.id));
	const pointing = db
		.select({ id: definition.id, sectionKey: definition.sectionKey })
		.from(definition)
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				eq(definition.communityStandardId, standard.row.id),
				eq(definition.scope, 'standard'),
				isNotNull(definition.adoptedVersionId)
			)
		)
		.all()
		.filter((row) => !adoptedIds.has(row.id));

	const restrictedIds = adopted
		.filter((row) => row.definition.visibility === 'restricted')
		.map((row) => row.definition.id);
	const liveExceptions = new Map(
		restrictedIds.length === 0
			? []
			: db
					.select()
					.from(transparencyException)
					.where(
						and(
							eq(transparencyException.communityId, ctx.community.id),
							eq(transparencyException.subjectType, 'definition'),
							inArray(transparencyException.subjectId, restrictedIds),
							isNull(transparencyException.expiredAt)
						)
					)
					.all()
					.filter((exception) => exception.expiresAt.getTime() > now)
					.map((exception) => [exception.subjectId, exception])
	);

	const sectionLayer = (sectionKey: string | null) => {
		const section = sectionKey ? view.section(sectionKey) : undefined;
		return section ? (view.artifact(section.artifact)?.layer ?? null) : null;
	};
	const titleOf = (sectionKey: string | null, fallback: string | null) => {
		const section = sectionKey ? view.section(sectionKey) : undefined;
		return section ? view.localise(section.i18n, locale).value.title : (fallback ?? 'Untitled');
	};

	return view.meta.layers.map(({ n: layer, name }) => {
		const clauses = artifactClauses(view, layer);
		const rule = clauses.map((clause) => ARTIFACT_RULES[clause.key]).find(Boolean);
		const ruleRef = clauses.find((clause) => ARTIFACT_RULES[clause.key])?.ref;
		const inLayer = adopted.filter((row) => sectionLayer(row.definition.sectionKey) === layer);
		const item = (row: (typeof adopted)[number], reason: Reason, at?: number): CheckItem => ({
			title: titleOf(row.definition.sectionKey, row.definition.title),
			definitionId: row.definition.id,
			reason,
			...(at === undefined ? {} : { at })
		});

		// --- complete: x.y.1 and x.y.3 -----------------------------------------
		const incomplete = view
			.mandatoryArtifacts()
			.filter((artifact) => artifact.layer === layer)
			.map((artifact) => ({ artifact, progress: progressOf(standard, artifact.key, answered) }))
			.filter(({ progress }) => !progress.complete);
		const checks: LayerCheck[] = [
			{
				property: 'complete',
				result: incomplete.length === 0 ? 'met' : 'not_met',
				// The list of mandatory artifacts (x.y.1), and — in Layers 0–2 — the
				// clause that missing ones cost compliance (x.y.3).
				refs: clauses
					.filter(
						(clause) =>
							clause.normativity === 'INFORMATIVE' ||
							(clause.disposition === 'satisfied_by_platform' && !ARTIFACT_RULES[clause.key])
					)
					.map((clause) => clause.ref),
				items: incomplete.map(({ artifact, progress }) => ({
					title: view.localise(artifact.i18n, locale).value.title ?? artifact.key,
					definitionId: null,
					reason: 'incomplete' as const,
					answered: progress.answered,
					authored: progress.authored
				}))
			}
		];
		if (!rule || !ruleRef) return { layer, name, checks };

		for (const property of rule.properties) {
			const base = { property, refs: [ruleRef] };
			if (inLayer.length === 0 && property !== 'versioned') {
				checks.push({ ...base, result: 'nothing_adopted', items: [] });
				continue;
			}

			if (property === 'versioned') {
				const broken = pointing.filter((row) => sectionLayer(row.sectionKey) === layer);
				checks.push({
					...base,
					result:
						inLayer.length + broken.length === 0
							? 'nothing_adopted'
							: broken.length
								? 'not_met'
								: 'met',
					items: broken.map((row) => ({
						title: titleOf(row.sectionKey, null),
						definitionId: row.id,
						reason: 'version_missing' as const
					}))
				});
			}

			if (property === 'accessible') {
				const restricted = inLayer.filter((row) => row.definition.visibility === 'restricted');
				const bounded = restricted.filter(
					(row) => rule.exceptions && liveExceptions.has(row.definition.id)
				);
				const failing = restricted.filter((row) => !bounded.includes(row));
				checks.push({
					...base,
					allowsExceptions: rule.exceptions,
					result: failing.length ? 'not_met' : 'met',
					items: [
						...failing.map((row) =>
							item(
								row,
								rule.exceptions ? 'restricted_without_exception' : 'restricted_no_exceptions'
							)
						),
						...bounded.map((row) =>
							item(
								row,
								'restricted_with_exception',
								liveExceptions.get(row.definition.id)!.expiresAt.getTime()
							)
						)
					]
				});
			}

			if (property === 'ratified') {
				const undecided = inLayer.filter((row) => !row.version.decisionId);
				const provisional = inLayer.filter(
					(row) => row.version.decisionId && row.definition.provisional
				);
				checks.push({
					...base,
					result: undecided.length ? 'not_met' : provisional.length ? 'attention' : 'met',
					items: [
						...undecided.map((row) => item(row, 'no_decision')),
						...provisional.map((row) => item(row, 'provisional'))
					]
				});
			}

			if (property === 'explicit') {
				const unread = inLayer.filter((row) => {
					const lint = row.version.linterResult as { clean?: boolean } | null;
					return !lint || lint.clean !== true;
				});
				checks.push({
					...base,
					result: 'human',
					needsReading: unread.length,
					items: unread.map((row) =>
						item(row, row.version.linterResult ? 'linter_findings' : 'never_linted')
					)
				});
			}

			if (property === 'maintained') {
				const undated = inLayer.filter((row) => !row.definition.reviewDueAt);
				const overdue = inLayer.filter(
					(row) => row.definition.reviewDueAt && row.definition.reviewDueAt.getTime() < now
				);
				checks.push({
					...base,
					result: undated.length ? 'not_met' : overdue.length ? 'attention' : 'met',
					items: [
						...undated.map((row) => item(row, 'no_review_date')),
						...overdue.map((row) =>
							item(row, 'review_overdue', row.definition.reviewDueAt!.getTime())
						)
					]
				});
			}
		}
		return { layer, name, checks };
	});
}

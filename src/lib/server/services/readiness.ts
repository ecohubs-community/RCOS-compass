import { and, eq, isNotNull } from 'drizzle-orm';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { clauseCoverage, definition } from '../db/schema/definitions.js';
import { communityStandard } from '../db/schema/tenancy.js';
import { getStandard, type StandardView } from '../standard/index.js';
import { artifactProgress, type ArtifactProgress } from './completeness.js';

/**
 * The two numbers, and their exact arithmetic. docs/03-data-model.md §7.
 *
 * Two audiences and two shapes. **Readiness** is inward: a percentage the
 * community uses to see where it is. **Compliance** is outward: a yes or a no,
 * because a claim to the world cannot be 84% true.
 *
 * Neither is ever stored. A stored number is a number that can be wrong, and
 * "the dashboard said 41% but the artifact list disagrees" is the bug that would
 * cost trust in every other figure the product shows. What *is* materialised is
 * `clause_coverage` — the clause → definition edge, rebuilt on adopt — which is
 * what makes this a count over an indexed table rather than a walk over every
 * definition asking the standard what it owns.
 */

/**
 * SvelteKit's dependency key. A load that shows a number calls `depends()` with
 * it; the freeze action calls `invalidate()` with it, and every panel refreshes.
 */
export const READINESS_DEPENDS = 'community:readiness';

/**
 * Which standard produces the outward claim.
 *
 * Modules are post-MVP (docs/09 §3) and their figures are **never** added to
 * this one — a community at 100% on permaculture with core incomplete is not
 * compliant, and saying otherwise would be the most damaging number the product
 * could print. When modules land, `meta.yaml` gains a `kind` and this constant
 * goes away.
 */
export const CORE_STANDARD_ID = 'rcos-core';

export type LayerReadiness = {
	layer: number;
	name: string;
	countable: number;
	satisfied: number;
	/** Null when a layer has nothing countable — not 0%, which reads as failure. */
	percent: number | null;
};

export type Readiness = {
	standardId: string;
	version: string;
	countable: number;
	satisfied: number;
	stale: number;
	provisional: number;
	percent: number;
	layers: LayerReadiness[];
};

export type Compliance = {
	standardId: string;
	version: string;
	compliant: boolean;
	incompleteArtifacts: ArtifactProgress[];
	/** A definition adopted before the community had a Decision Matrix. */
	provisionalDefinitions: number;
};

type ActiveStandard = { row: typeof communityStandard.$inferSelect; view: StandardView };

function activeStandards(db: Db, ctx: Ctx): ActiveStandard[] {
	return db
		.select()
		.from(communityStandard)
		.where(
			and(
				eq(communityStandard.communityId, ctx.community.id),
				eq(communityStandard.status, 'active')
			)
		)
		.all()
		.map((row) => ({ row, view: getStandard(row.standardId, row.version) }));
}

/**
 * Memoised for the life of one request.
 *
 * Several panels on a dashboard ask for the same number, and the `Ctx` object is
 * built once per request — so it is the natural key, and a `WeakMap` means a
 * finished request's entry goes away without anyone remembering to clear it.
 * Nothing survives the request, which is the point: this is a cache of a
 * computation, never of a fact.
 */
const perRequest = new WeakMap<Ctx, Map<string, Readiness>>();

/** What each covered clause's definition looks like right now. */
type CoveredClause = { clauseKey: string; adopted: boolean; stale: boolean; provisional: boolean };

function coveredClauses(db: Db, communityStandardId: string, now: number): CoveredClause[] {
	return (
		db
			.select({
				clauseKey: clauseCoverage.clauseKey,
				adoptedVersionId: definition.adoptedVersionId,
				reviewDueAt: definition.reviewDueAt,
				provisional: definition.provisional,
				scope: definition.scope
			})
			.from(clauseCoverage)
			.innerJoin(definition, eq(definition.id, clauseCoverage.definitionId))
			.where(eq(clauseCoverage.communityStandardId, communityStandardId))
			.all()
			// Local definitions are outside this arithmetic entirely (§3a). Coverage
			// should never hold one; filtering says so rather than assuming it.
			.filter((row) => row.scope === 'standard')
			.map((row) => ({
				clauseKey: row.clauseKey,
				adopted: row.adoptedVersionId !== null,
				// Past its review date is *overdue for a look*, not unanswered. The rule
				// still exists, so it still counts.
				stale: row.reviewDueAt !== null && row.reviewDueAt.getTime() < now,
				provisional: row.provisional
			}))
	);
}

function readinessFor(db: Db, ctx: Ctx, standard: ActiveStandard): Readiness {
	const covered = coveredClauses(db, standard.row.id, ctx.now());
	const satisfiedKeys = new Set(covered.filter((row) => row.adopted).map((row) => row.clauseKey));
	const staleKeys = new Set(
		covered.filter((row) => row.adopted && row.stale).map((r) => r.clauseKey)
	);
	const provisionalKeys = new Set(
		covered.filter((row) => row.adopted && row.provisional).map((r) => r.clauseKey)
	);

	const countable = standard.view.countableClauses();
	const satisfied = countable.filter((clause) => satisfiedKeys.has(clause.key));

	const layers = standard.view.meta.layers.map((layer) => {
		const inLayer = countable.filter((clause) => clause.layer === layer.n);
		const answered = inLayer.filter((clause) => satisfiedKeys.has(clause.key)).length;
		return {
			layer: layer.n,
			name: layer.name,
			countable: inLayer.length,
			satisfied: answered,
			percent: inLayer.length === 0 ? null : Math.round((answered / inLayer.length) * 100)
		};
	});

	return {
		standardId: standard.row.standardId,
		version: standard.row.version,
		countable: countable.length,
		satisfied: satisfied.length,
		stale: countable.filter((clause) => staleKeys.has(clause.key)).length,
		provisional: countable.filter((clause) => provisionalKeys.has(clause.key)).length,
		percent: countable.length === 0 ? 0 : Math.round((satisfied.length / countable.length) * 100),
		layers
	};
}

/** Readiness for one adopted standard. Core unless a module is named. */
export function readiness(
	ctx: Ctx,
	options: { db?: Db; standardId?: string } = {}
): Readiness | null {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const wanted = options.standardId ?? CORE_STANDARD_ID;

	const cached = perRequest.get(ctx)?.get(wanted);
	if (cached) return cached;

	const standard = activeStandards(db, ctx).find((s) => s.row.standardId === wanted);
	if (!standard) return null;

	const computed = readinessFor(db, ctx, standard);
	const byStandard = perRequest.get(ctx) ?? new Map();
	byStandard.set(wanted, computed);
	perRequest.set(ctx, byStandard);
	return computed;
}

/**
 * Every adopted standard's figure, each on its own.
 *
 * Deliberately a list rather than a total. RCOS §10.1.5: a module's number is
 * never added to core's, on any surface.
 */
export function allReadiness(ctx: Ctx, options: { db?: Db } = {}): Readiness[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	return activeStandards(db, ctx).map((standard) => readinessFor(db, ctx, standard));
}

/**
 * The outward claim, about core and nothing else.
 *
 * Two ways to be false, and both matter: a mandatory artifact is unfinished, or
 * something answering a MUST was adopted before the community had agreed how it
 * decides. The second is easy to forget and is exactly the case a sceptical
 * reader would ask about.
 */
export function compliance(ctx: Ctx, options: { db?: Db } = {}): Compliance | null {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const core = activeStandards(db, ctx).find((s) => s.row.standardId === CORE_STANDARD_ID);
	if (!core) return null;

	const incompleteArtifacts = core.view
		.mandatoryArtifacts()
		.map((artifact) => artifactProgress(ctx, artifact.key, { db }))
		.filter((progress) => !progress.complete);

	const provisionalDefinitions = db
		.select({ id: definition.id })
		.from(definition)
		.where(
			and(
				eq(definition.communityStandardId, core.row.id),
				eq(definition.provisional, true),
				isNotNull(definition.adoptedVersionId)
			)
		)
		.all().length;

	return {
		standardId: core.row.standardId,
		version: core.row.version,
		compliant: incompleteArtifacts.length === 0 && provisionalDefinitions === 0,
		incompleteArtifacts,
		provisionalDefinitions
	};
}

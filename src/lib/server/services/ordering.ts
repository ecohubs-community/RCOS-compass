import { and, desc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { changeLog } from '../db/schema/decisions.js';
import { discussion } from '../db/schema/discussions.js';
import { evidence } from '../db/schema/documents.js';
import { DEFAULT_WEIGHTS, pathOverride, pathWeights, type PathWeights } from '../db/schema/path.js';
import type { StandardView } from '../standard/index.js';
import { raisedSections, MAX_RAISES } from './risk-profile.js';

/**
 * The ordering, as four numbers a community can see and argue with.
 * UI spec §4.4, `design.md` §1.
 *
 * The brief is one sentence — *a visible, editable, versioned settings object,
 * not hidden logic* — which rules out the obvious implementation, a comparator
 * with constants in the source, because a community cannot disagree with a
 * number it cannot see. So every item carries its four contributions
 * separately, the rank is their weighted sum, and the sentence explaining the
 * position is generated from whichever contributions actually moved it. The
 * sentence and the position come out of one computation and cannot drift.
 *
 * ## Each contribution is a fraction
 *
 * Every `value` below is in `[0, 1]` (attention in `[-1, 1]`), so a weight is
 * the most points that input can ever contribute. That is what makes the
 * settings screen honest: "dependency: 200" means dependency can move an item
 * 200 points and severity can move it 10, which is a claim a member can check.
 *
 * ## Why the defaults are so unbalanced
 *
 * P3 ordered by how many questions are in the way, then by layer, then by key.
 * "A community that changes nothing sees no change" is a requirement, and a
 * weighted sum only satisfies it while the dependency contribution's smallest
 * step — one layer — outweighs everything else a day-one community has, which
 * is severity alone: a community with no risk profile and nothing decided
 * scores zero on the other two.
 *
 * That step is the weight divided by the number of structural positions the
 * standard has, `(maxBlockers + 1) × layers − 1`. RCOS-Core 0.1 has seven
 * layers and at most two blockers, so twenty steps, and the dependency weight
 * has to exceed twenty times the severity weight. It is 250 against 10.
 *
 * This is fragile in exactly one direction: a standard with more layers or
 * deeper dependencies, or a tidier-looking set of defaults, breaks it. Which is
 * why it is not left to a comment — `defaultsPreserveStructure()` computes the
 * requirement from the loaded standard, and a test fails if it stops holding.
 */

export type Contribution = {
	/** `[0, 1]`, or `[-1, 1]` for attention. What the input says about this item. */
	value: number;
	/** The community's opinion of how much that should matter. */
	weight: number;
	/** `value × weight`. What actually moved the item. */
	points: number;
	/** Why this input has the value it has, in the community's own terms. */
	because: string | null;
};

export type Contributions = {
	dependency: Contribution;
	severity: Contribution;
	risk: Contribution;
	attention: Contribution;
};

export type Weights = Pick<PathWeights, 'dependency' | 'severity' | 'risk' | 'attention'>;

/** What each input needs to know about one section, gathered once per request. */
export type OrderingInputs = {
	weights: Weights;
	layers: number;
	/** The most questions any one section can be waiting on. Sets the scale. */
	maxBlockers: number;
	maxClauses: number;
	answered: ReadonlySet<string>;
	raised: ReadonlyMap<string, number>;
	openThreads: ReadonlySet<string>;
	confirmedEvidence: ReadonlySet<string>;
	/** Answered sections whose own dependencies name this one. */
	referencedByAnswered: ReadonlyMap<string, string[]>;
};

export type Scored = {
	sectionKey: string;
	layer: number | null;
	blocking: string[];
	score: number;
	contributions: Contributions;
};

/**
 * The active weights, or the shipped opinion written out as if it were a row.
 *
 * A community that has never opened the settings has the same shape of answer
 * as one that has, so nothing downstream has to special-case "no weights yet"
 * — which is the case that would quietly fall back to different numbers.
 */
export function activeWeights(db: Db, communityId: string): Weights {
	const row = db
		.select()
		.from(pathWeights)
		.where(and(eq(pathWeights.communityId, communityId), eq(pathWeights.active, true)))
		.get();
	return row ?? DEFAULT_WEIGHTS;
}

export function gatherInputs(
	db: Db,
	communityId: string,
	view: StandardView,
	answered: ReadonlySet<string>,
	weights: Weights,
	profile: Parameters<typeof raisedSections>[0]
): OrderingInputs {
	const layers = new Set(view.artifacts.map((artifact) => artifact.layer)).size;
	const maxBlockers = maxDependsOn(view);

	const clausesByOwner = new Map<string, string[]>();
	for (const clause of view.countableClauses()) {
		if (!clause.owner) continue;
		clausesByOwner.set(clause.owner, [...(clausesByOwner.get(clause.owner) ?? []), clause.key]);
	}
	const maxClauses = Math.max(1, ...[...clausesByOwner.values()].map((keys) => keys.length));

	const openThreads = new Set(
		db
			.select({ clauseKey: discussion.clauseKey })
			.from(discussion)
			.where(and(eq(discussion.communityId, communityId), eq(discussion.status, 'open')))
			.all()
			.map((row) => row.clauseKey)
			.filter((key): key is string => key !== null)
	);

	/**
	 * Confirmed evidence only. A *suggestion* is a model's guess and moves
	 * nothing: letting it lower an item's position would be an AI output changing
	 * what a community is told to do next, with nobody in between.
	 */
	const confirmed = new Set<string>();
	const clauseKeys = [...clausesByOwner.values()].flat();
	if (clauseKeys.length > 0) {
		for (const row of db
			.select({ clauseKey: evidence.clauseKey })
			.from(evidence)
			.where(
				and(
					eq(evidence.communityId, communityId),
					eq(evidence.state, 'confirmed'),
					inArray(evidence.clauseKey, clauseKeys)
				)
			)
			.all()) {
			confirmed.add(row.clauseKey);
		}
	}

	// Which unanswered sections something already adopted leans on. The community
	// has committed to a rule that refers to a rule they have not written.
	const referencedByAnswered = new Map<string, string[]>();
	for (const key of answered) {
		for (const needed of view.annotation(key)?.dependsOn ?? []) {
			if (answered.has(needed)) continue;
			referencedByAnswered.set(needed, [...(referencedByAnswered.get(needed) ?? []), key]);
		}
	}

	return {
		weights,
		layers,
		maxBlockers,
		maxClauses,
		answered,
		raised: raisedSections(profile),
		openThreads,
		confirmedEvidence: confirmed,
		referencedByAnswered
	};
}

/** Clause keys a section owns, and whether any of them carries confirmed evidence. */
type SectionFacts = {
	sectionKey: string;
	layer: number | null;
	blocking: string[];
	ownedClauses: string[];
};

export function score(facts: SectionFacts, inputs: OrderingInputs, view: StandardView): Scored {
	const { weights, layers, maxBlockers, maxClauses } = inputs;

	/**
	 * Structural readiness: how much is in the way, and how deep in the standard
	 * this sits.
	 *
	 * Both in one number because they are one question. A section nobody is
	 * blocked on, in the layer the standard puts first, is the thing to do next;
	 * a section three layers down whose dependencies are unwritten is the thing
	 * that would be answered in the dark. Counting the blockers rather than
	 * asking whether there are any is what P3 did, and reproducing it is the
	 * difference between "the order barely changed" and "the order did not
	 * change".
	 */
	const blockers = Math.min(facts.blocking.length, maxBlockers);
	const depth = facts.layer ?? layers - 1;
	const positions = (maxBlockers + 1) * layers - 1;
	const dependencyValue = 1 - (blockers * layers + depth) / positions;

	const dependencyBecause = facts.blocking.length
		? `${facts.blocking.length} question${facts.blocking.length === 1 ? '' : 's'} have to be answered first`
		: depth === 0
			? 'nothing else has to be decided first'
			: null;

	// How much of the standard this holds up. Sections owning no countable clause
	// score zero: they are real work, but nothing is measured against them.
	const owned = facts.ownedClauses.length;
	const severityValue = owned / maxClauses;

	const raises = inputs.raised.get(facts.sectionKey) ?? 0;
	const riskValue = MAX_RAISES === 0 ? 0 : raises / MAX_RAISES;

	/**
	 * What they already have. UI spec §4.4.
	 *
	 * Confirmed evidence drops an item: a community with language about this
	 * already has somewhere to start and is not staring at a blank page. An open
	 * discussion raises it, because the group has shown it cares. An adopted
	 * definition leaning on this one raises it hardest — they have already
	 * committed to a rule that refers to a rule they have not written.
	 */
	const hasEvidence = facts.ownedClauses.some((key) => inputs.confirmedEvidence.has(key));
	const hasThread = facts.ownedClauses.some((key) => inputs.openThreads.has(key));
	const leaners = inputs.referencedByAnswered.get(facts.sectionKey) ?? [];

	const attentionValue = Math.max(
		-1,
		Math.min(1, (hasThread ? 0.5 : 0) + (leaners.length > 0 ? 0.5 : 0) - (hasEvidence ? 0.5 : 0))
	);

	const attentionBecause = [
		hasThread ? 'a discussion is already open' : null,
		leaners.length > 0
			? `${nameOf(view, leaners[0]!)}${leaners.length > 1 ? ` and ${leaners.length - 1} more` : ''} already refers to it`
			: null,
		hasEvidence ? 'you have language about this in a document already' : null
	]
		.filter(Boolean)
		.join('; ');

	const make = (value: number, weight: number, because: string | null): Contribution => ({
		value,
		weight,
		points: value * weight,
		because
	});

	const contributions: Contributions = {
		dependency: make(dependencyValue, weights.dependency, dependencyBecause),
		severity: make(
			severityValue,
			weights.severity,
			owned > 1 ? `it answers ${owned} clauses of the standard` : null
		),
		risk: make(riskValue, weights.risk, raises > 0 ? riskBecause(raises) : null),
		attention: make(attentionValue, weights.attention, attentionBecause || null)
	};

	const score =
		contributions.dependency.points +
		contributions.severity.points +
		contributions.risk.points +
		contributions.attention.points;

	return {
		sectionKey: facts.sectionKey,
		layer: facts.layer,
		blocking: facts.blocking,
		score,
		contributions
	};
}

const riskBecause = (raises: number) =>
	raises === 1
		? 'one of your answers about the community raises it'
		: `${raises} of your answers about the community raise it`;

function nameOf(view: StandardView, sectionKey: string): string {
	const section = view.section(sectionKey);
	return section ? `“${view.localise(section.i18n, 'en').value.title}”` : sectionKey;
}

/**
 * The sentence under each item, built from whichever contributions moved it.
 *
 * Only the ones that actually did: a reason listing every input would be the
 * same sentence on every row, which is a different way of explaining nothing.
 * The order is by points, so the biggest mover leads.
 */
export function reasonFrom(contributions: Contributions): string {
	const parts = (Object.values(contributions) as Contribution[])
		.filter((c) => c.because !== null && c.points !== 0)
		.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
		.map((c) => c.because!);

	if (parts.length === 0) return 'Nothing about this one stands out yet';
	return `${parts[0]![0]!.toUpperCase()}${parts[0]!.slice(1)}${parts.length > 1 ? `; ${parts.slice(1).join('; ')}` : ''}`;
}

/**
 * Does the shipped opinion still reproduce the structural order?
 *
 * The requirement is "a community that changes nothing sees no change", and it
 * holds only while the dependency contribution's layer step outweighs
 * everything a day-one community can score — which is severity alone. Checked
 * against the loaded standard rather than asserted in a comment, because the
 * thing that would break it is a standard with more layers or a tidier-looking
 * set of defaults, and both would do it silently.
 */
export function defaultsPreserveStructure(view: StandardView, weights: Weights = DEFAULT_WEIGHTS) {
	const layers = new Set(view.artifacts.map((artifact) => artifact.layer)).size;
	const positions = (maxDependsOn(view) + 1) * layers - 1;
	const layerStep = weights.dependency / positions;
	return { ok: layerStep > weights.severity, layerStep, positions, severity: weights.severity };
}

/** The deepest a section's dependencies go in this standard. */
function maxDependsOn(view: StandardView): number {
	return Math.max(
		0,
		...view.annotatedSectionKeys.map((key) => view.annotation(key)?.dependsOn.length ?? 0)
	);
}

/**
 * Changing the weights, which is a governance act rather than a preference.
 *
 * Supersede rather than update: the ordering is an opinion the community
 * adopted, the rest of the product treats those as append-only, and an ordering
 * that can be silently retuned is one nobody can audit — including the person
 * who retuned it and forgot. So the path screen can say "reordered by Ana on 3
 * September" and show what the numbers were before.
 */
export function setWeights(ctx: Ctx, next: Weights, options: { db?: Db } = {}): PathWeights {
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);

	for (const [name, value] of Object.entries(next)) {
		// Refused here as well as by the CHECK, so a member sees a sentence rather
		// than a constraint name. A negative weight would invert an input rather
		// than silence it, which is not something the screen offers.
		if (!Number.isInteger(value) || value < 0) {
			error(400, `${name} has to be zero or more.`);
		}
	}

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());
	const id = newId();

	return db.transaction((tx) => {
		const previous = tx
			.select()
			.from(pathWeights)
			.where(and(eq(pathWeights.communityId, ctx.community.id), eq(pathWeights.active, true)))
			.get();

		// Deactivate first: the partial unique index allows exactly one active row
		// per community, so inserting before superseding is refused by the database
		// rather than producing two answers.
		if (previous) {
			tx.update(pathWeights).set({ active: false }).where(eq(pathWeights.id, previous.id)).run();
		}

		tx.insert(pathWeights)
			.values({
				id,
				communityId: ctx.community.id,
				...next,
				isDefault: false,
				active: true,
				changedBy: ctx.user.id,
				changedAt: now
			})
			.run();

		tx.insert(changeLog)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				at: now,
				actorId: ctx.user.id,
				kind: 'path.reweighted',
				subjectType: 'path_weights',
				subjectId: id,
				summary: 'Changed how the path is ordered',
				payload: { from: previous ? weightsOf(previous) : DEFAULT_WEIGHTS, to: next }
			})
			.run();

		return tx.select().from(pathWeights).where(eq(pathWeights.id, id)).get()!;
	});
}

const weightsOf = (row: Weights): Weights => ({
	dependency: row.dependency,
	severity: row.severity,
	risk: row.risk,
	attention: row.attention
});

/** The active row if a community has tuned the weights, and the history behind it. */
export function weightsHistory(ctx: Ctx, options: { db?: Db } = {}): PathWeights[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	return db
		.select()
		.from(pathWeights)
		.where(eq(pathWeights.communityId, ctx.community.id))
		.orderBy(desc(pathWeights.changedAt))
		.all();
}

/**
 * Where a community put something by hand.
 *
 * The computed position is kept beside it rather than replaced. An override
 * that erases the computation makes the list unfalsifiable — nobody can tell
 * afterwards whether the ordering was wrong or the community simply disagreed —
 * and keeping both is what lets somebody revisit it later.
 */
export function placeOverride(
	ctx: Ctx,
	sectionKey: string,
	position: number,
	options: { db?: Db } = {}
): void {
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);
	if (!Number.isInteger(position) || position < 0) error(400, 'That is not a position.');

	const db = options.db ?? getDb();
	const active = db
		.select({ id: pathWeights.id })
		.from(pathWeights)
		.where(and(eq(pathWeights.communityId, ctx.community.id), eq(pathWeights.active, true)))
		.get();

	const row = {
		communityId: ctx.community.id,
		sectionKey,
		position,
		// What the ordering was when they placed it. The item can then say its
		// placement may be stale rather than the tool quietly discarding a
		// deliberate act or pretending nothing happened.
		weightsIdAtPlacement: active?.id ?? null,
		placedBy: ctx.user.id,
		placedAt: new Date(ctx.now())
	};

	db.insert(pathOverride)
		.values(row)
		.onConflictDoUpdate({
			target: [pathOverride.communityId, pathOverride.sectionKey],
			set: row
		})
		.run();
}

/** Release an item back to wherever the ordering puts it. */
export function clearOverride(ctx: Ctx, sectionKey: string, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	db.delete(pathOverride)
		.where(
			and(eq(pathOverride.communityId, ctx.community.id), eq(pathOverride.sectionKey, sectionKey))
		)
		.run();
}

export type Override = {
	/** Where the community put it. */
	position: number;
	/** Where the ordering would have put it. Both, always. */
	computedPosition: number;
	/**
	 * The weights have changed since it was placed.
	 *
	 * Not a reason to drop the override — the community's own instruction
	 * disappearing because they adjusted a slider is the worst of the three
	 * options — but the item says so and offers to release it. The community
	 * decides; the tool does not decide for them.
	 */
	stale: boolean;
};

/**
 * Apply the community's own placements over the computed order.
 *
 * Items without an override keep their computed sequence and close up around
 * the placed ones, so the result is dense and every position is real.
 */
export function applyOverrides<T extends { sectionKey: string }>(
	db: Db,
	communityId: string,
	computed: T[]
): (T & { override: Override | null })[] {
	const overrides = db
		.select()
		.from(pathOverride)
		.where(eq(pathOverride.communityId, communityId))
		.all();
	if (overrides.length === 0) return computed.map((item) => ({ ...item, override: null }));

	const activeId =
		db
			.select({ id: pathWeights.id })
			.from(pathWeights)
			.where(and(eq(pathWeights.communityId, communityId), eq(pathWeights.active, true)))
			.get()?.id ?? null;

	const byKey = new Map(overrides.map((row) => [row.sectionKey, row]));
	const computedPosition = new Map(computed.map((item, at) => [item.sectionKey, at]));

	const placed = computed
		.filter((item) => byKey.has(item.sectionKey))
		.sort((a, b) => byKey.get(a.sectionKey)!.position - byKey.get(b.sectionKey)!.position);
	const rest = computed.filter((item) => !byKey.has(item.sectionKey));

	const out: (T & { override: Override | null })[] = rest.map((item) => ({
		...item,
		override: null
	}));

	for (const item of placed) {
		const row = byKey.get(item.sectionKey)!;
		out.splice(Math.min(row.position, out.length), 0, {
			...item,
			override: {
				position: row.position,
				computedPosition: computedPosition.get(item.sectionKey)!,
				stale: row.weightsIdAtPlacement !== activeId
			}
		});
	}

	return out;
}

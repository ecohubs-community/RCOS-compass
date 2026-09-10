import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { definition } from '../db/schema/definitions.js';
import { discussion } from '../db/schema/discussions.js';
import type { Effort } from '../standard/types.js';
import { activeStandardView, answeredSections } from './completeness.js';
import {
	activeWeights,
	applyOverrides,
	gatherInputs,
	reasonFrom,
	score,
	type Contributions,
	type Override,
	type Weights
} from './ordering.js';
import { getRiskProfile } from './risk-profile.js';

/**
 * What a community still has to decide, in an order that is not arbitrary.
 *
 * The product's whole claim is turning 213 clauses into a short ordered list
 * (UI spec §4.1b), so this is the piece that has to be defensible: an unanswered
 * section whose dependencies are already answered comes before one that would
 * be answered in the dark.
 *
 * P5 made the ordering arguable: four contributions the community can see and
 * reweight, summed. The defaults reproduce what P3 did — unblocked first, then
 * by layer — so a community that changes nothing sees no change; everything
 * after that is theirs. `ordering.ts` holds the arithmetic and the reason why
 * the defaults are shaped the way they are.
 */

export type PathItem = {
	sectionKey: string;
	artifactKey: string;
	layer: number | null;
	/** The plain-language question, never clause text. */
	question: string;
	effort: Effort;
	/** Why this one is here, in the community's own terms. */
	reason: string;
	/**
	 * The four inputs, kept separate rather than collapsed into the rank.
	 *
	 * A community that disagrees with an ordering needs to know *which* input it
	 * is disagreeing with: "this is high because your risk profile says you hold
	 * land" is arguable, and "this is high" is not.
	 */
	contributions: Contributions;
	/** The weighted sum these produced. Shown as reasons, never as a number. */
	score: number;
	/** Set when the community moved this one by hand. Both positions, always. */
	override: Override | null;
	/** The clause a new discussion about this should be filed against. */
	clauseKey: string | null;
	/** An open discussion already exists for it. */
	discussionId: string | null;
};

const EFFORT_LABEL: Record<Effort, string> = {
	one_conversation: 'one conversation',
	one_meeting: 'one meeting',
	a_series: 'a series'
};

export function effortLabel(effort: Effort): string {
	return EFFORT_LABEL[effort];
}

/**
 * The ordered list of what is still unanswered.
 *
 * Only *authored* sections appear: a Ratification Record is not work, and
 * putting one in a community's queue is the busywork docs/12 removed.
 */
export function path(
	ctx: Ctx,
	options: { db?: Db; limit?: number; weights?: Weights } = {}
): PathItem[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const standard = activeStandardView(db, ctx);
	if (!standard) return [];

	const answered = answeredSections(db, standard.row.id);
	const openThreads = new Map(
		db
			.select()
			.from(discussion)
			.where(and(eq(discussion.communityId, ctx.community.id), eq(discussion.status, 'open')))
			.all()
			.filter((thread) => thread.clauseKey !== null)
			.map((thread) => [thread.clauseKey!, thread.id])
	);

	/**
	 * Every clause a section owns, not only its first.
	 *
	 * A thread is filed against one clause; a section usually owns several, and
	 * looking at the first alone meant a discussion opened on any of the others
	 * did not exist as far as this list was concerned. One pass, because
	 * `countableClauses()` re-filters every clause on each call and this loop
	 * runs once per authored section.
	 */
	const clausesByOwner = new Map<string, string[]>();
	for (const clause of standard.view.countableClauses()) {
		if (!clause.owner) continue;
		clausesByOwner.set(clause.owner, [...(clausesByOwner.get(clause.owner) ?? []), clause.key]);
	}

	const weights = options.weights ?? activeWeights(db, ctx.community.id);
	const inputs = gatherInputs(
		db,
		ctx.community.id,
		standard.view,
		answered,
		weights,
		getRiskProfile(ctx, { db })
	);

	const items = standard.view
		.authoredSections()
		.filter((section) => !answered.has(section.key))
		.map((section) => {
			const annotation = standard.view.annotation(section.key);
			const artifact = standard.view.artifact(section.artifact);
			const blocking = (annotation?.dependsOn ?? []).filter((key) => !answered.has(key));
			const ownedClauses = clausesByOwner.get(section.key) ?? [];

			const scored = score(
				{ sectionKey: section.key, layer: artifact?.layer ?? null, blocking, ownedClauses },
				inputs,
				standard.view
			);

			return {
				sectionKey: section.key,
				artifactKey: section.artifact,
				layer: artifact?.layer ?? null,
				question:
					annotation?.question ??
					standard.view.localise(section.i18n, ctx.community.locale as 'en').value.title,
				effort: annotation?.effort ?? ('one_meeting' as Effort),
				reason: reasonFrom(scored.contributions),
				// What a "Start discussion" link should file the thread against.
				clauseKey: ownedClauses[0] ?? null,
				discussionId:
					ownedClauses.map((key) => openThreads.get(key)).find((id) => id !== undefined) ?? null,
				contributions: scored.contributions,
				score: scored.score
			};
		});

	// Highest score first. The key is the only tie-break, and it is a tie-break
	// rather than an opinion: two items the four inputs cannot separate are in
	// the standard's own order.
	items.sort((a, b) => b.score - a.score || a.sectionKey.localeCompare(b.sectionKey));

	// The community's own placements go on last, over a computed order that is
	// still there underneath — an override that erased the computation would make
	// the list unfalsifiable.
	/**
	 * The reader's own draft goes on last, over the community's published order,
	 * which is over the computation. Three layers, each one visible to the person
	 * it belongs to and none of them erasing the one beneath.
	 */
	const ordered = applyOverrides(db, ctx.community.id, items, ctx.user.id);

	const { limit } = options;
	return limit ? ordered.slice(0, limit) : ordered;
}

export type Attention = {
	kind: 'stale' | 'provisional' | 'stalled';
	count: number;
	detail: string;
};

/** The three things a dashboard should interrupt someone about. UI spec §4.1c. */
export function needsAttention(ctx: Ctx, options: { db?: Db } = {}): Attention[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const now = ctx.now();
	const out: Attention[] = [];

	const stale = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				isNotNull(definition.adoptedVersionId),
				isNotNull(definition.reviewDueAt),
				lt(definition.reviewDueAt, new Date(now))
			)
		)
		.all();
	if (stale.length > 0) {
		out.push({
			kind: 'stale',
			count: stale.length,
			detail: `${stale.length === 1 ? 'A definition is' : `${stale.length} definitions are`} past their review date`
		});
	}

	const provisional = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				eq(definition.provisional, true),
				isNotNull(definition.adoptedVersionId)
			)
		)
		.all();
	if (provisional.length > 0) {
		out.push({
			kind: 'provisional',
			count: provisional.length,
			detail: `${provisional.length} provisional ${provisional.length === 1 ? 'definition awaits' : 'definitions await'} ratification — recorded before the Decision Matrix was adopted`
		});
	}

	const STALLED_MS = 12 * 24 * 60 * 60_000;
	const stalled = db
		.select()
		.from(discussion)
		.where(and(eq(discussion.communityId, ctx.community.id), eq(discussion.status, 'open')))
		.all()
		.filter((thread) => now - thread.lastActivityAt.getTime() > STALLED_MS);
	if (stalled.length > 0) {
		out.push({
			kind: 'stalled',
			count: stalled.length,
			detail: `${stalled.length} ${stalled.length === 1 ? 'discussion has' : 'discussions have'} been quiet for over 12 days`
		});
	}

	return out;
}

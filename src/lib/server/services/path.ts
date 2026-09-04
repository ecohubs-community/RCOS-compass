import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { definition } from '../db/schema/definitions.js';
import { discussion } from '../db/schema/discussions.js';
import type { Effort } from '../standard/types.js';
import { activeStandardView, answeredSections } from './completeness.js';

/**
 * What a community still has to decide, in an order that is not arbitrary.
 *
 * The product's whole claim is turning 213 clauses into a short ordered list
 * (UI spec §4.1b), so this is the piece that has to be defensible: an unanswered
 * section whose dependencies are already answered comes before one that would
 * be answered in the dark.
 *
 * The weighted ordering with its four sliders is P5. Here it is the dependency
 * edges the standard already carries, plus layer order as the tie-break — the
 * standard is built so Layer 0 comes first, and following it is a better default
 * than inventing one.
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
export function path(ctx: Ctx, options: { db?: Db; limit?: number } = {}): PathItem[] {
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

	const items = standard.view
		.authoredSections()
		.filter((section) => !answered.has(section.key))
		.map((section) => {
			const annotation = standard.view.annotation(section.key);
			const artifact = standard.view.artifact(section.artifact);
			const blocking = (annotation?.dependsOn ?? []).filter((key) => !answered.has(key));
			const owned = standard.view.countableClauses().find((c) => c.owner === section.key);

			return {
				sectionKey: section.key,
				artifactKey: section.artifact,
				layer: artifact?.layer ?? null,
				question:
					annotation?.question ??
					standard.view.localise(section.i18n, ctx.community.locale as 'en').value.title,
				effort: annotation?.effort ?? ('one_meeting' as Effort),
				reason: reasonFor(standard.view, blocking, artifact?.i18n.en?.title ?? section.artifact),
				discussionId: owned ? (openThreads.get(owned.key) ?? null) : null,
				blocking: blocking.length
			};
		});

	// Unblocked first, then by layer, then in document order. A question whose
	// answer depends on one nobody has written yet gets answered in the dark.
	items.sort(
		(a, b) =>
			a.blocking - b.blocking ||
			(a.layer ?? 99) - (b.layer ?? 99) ||
			a.sectionKey.localeCompare(b.sectionKey)
	);

	const { limit } = options;
	return (limit ? items.slice(0, limit) : items).map(({ blocking: _blocking, ...item }) => item);
}

function reasonFor(
	view: NonNullable<ReturnType<typeof activeStandardView>>['view'],
	blocking: string[],
	artifactTitle: string
): string {
	if (blocking.length === 0) return `Nothing else has to be decided first · ${artifactTitle}`;

	const first = view.section(blocking[0]!);
	const name = first ? view.localise(first.i18n, 'en').value.title : blocking[0]!;
	return blocking.length === 1
		? `Waiting on “${name}”`
		: `Waiting on “${name}” and ${blocking.length - 1} more`;
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

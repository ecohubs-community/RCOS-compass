import { and, desc, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { user } from '../db/schema/auth.js';
import { feedbackReport } from '../db/schema/operations.js';
import { community, membership } from '../db/schema/tenancy.js';
import { personLabel } from './person.js';

/**
 * A member saying something is wrong with a screen.
 * `docs/08-roadmap-mvp.md` P7 — "a feedback loop that lands in OpenSpec
 * proposals rather than in a chat backlog".
 *
 * The roadmap's phrasing is the whole design. A pilot generates the kind of
 * observation that evaporates: somebody says "the ordering made no sense to me"
 * in a call, everybody nods, and nothing changes because nobody wrote down which
 * screen they were on. This writes it down.
 *
 * **It captures the route and their words, and nothing else.** No page state, no
 * form values, no screenshot. A bug report that scooped up the half-written
 * definition somebody was looking at when they got confused would be a
 * governance leak wearing a helpful hat, and the text this product exists to
 * keep inside a community is exactly the text that would be on screen.
 */

export const FEEDBACK_KINDS = ['confusing', 'broken', 'missing', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export function reportFeedback(
	ctx: Ctx,
	input: { route: string; kind: string; body: string },
	options: { db?: Db } = {}
): void {
	// Any member: the person who cannot work out a screen is rarely the steward.
	requirePermission(ctx, 'community.read');

	const body = input.body.trim();
	if (!body) error(400, 'Say what happened.');
	const kind = (FEEDBACK_KINDS as readonly string[]).includes(input.kind)
		? (input.kind as FeedbackKind)
		: 'other';

	const db = options.db ?? getDb();
	db.insert(feedbackReport)
		.values({
			id: newId(),
			communityId: ctx.community.id,
			membershipId: ctx.membership.id,
			// The path, not the URL: a query string can carry a search somebody
			// typed, which is their words about their own governance.
			route: input.route.split('?')[0]!.slice(0, 200),
			kind,
			body: body.slice(0, 2000),
			status: 'open',
			createdAt: new Date(ctx.now()),
			handledAt: null
		})
		.run();
}

export type FeedbackView = {
	id: string;
	route: string;
	kind: FeedbackKind;
	body: string;
	status: 'open' | 'handled';
	from: string;
	createdAt: number;
};

/** A community's own reports. Never another's. */
export function listFeedback(ctx: Ctx, options: { db?: Db } = {}): FeedbackView[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	return db
		.select({
			id: feedbackReport.id,
			route: feedbackReport.route,
			kind: feedbackReport.kind,
			body: feedbackReport.body,
			status: feedbackReport.status,
			createdAt: feedbackReport.createdAt,
			name: user.name,
			displayName: membership.displayName,
			seq: membership.seq,
			erasedAt: user.erasedAt
		})
		.from(feedbackReport)
		.leftJoin(membership, eq(membership.id, feedbackReport.membershipId))
		.leftJoin(user, eq(user.id, membership.userId))
		.where(eq(feedbackReport.communityId, ctx.community.id))
		.orderBy(desc(feedbackReport.createdAt))
		.all()
		.map(({ name, displayName, seq, erasedAt, createdAt, ...row }) => ({
			...row,
			createdAt: createdAt.getTime(),
			// Through the one function, like every other surface that shows a person.
			from: personLabel({ erasedAt: erasedAt ?? null, name, displayName, seq })
		}));
}

export function markHandled(ctx: Ctx, id: string, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'settings.manage');
	const db = options.db ?? getDb();
	const changed = db
		.update(feedbackReport)
		.set({ status: 'handled', handledAt: new Date(ctx.now()) })
		.where(and(eq(feedbackReport.id, id), eq(feedbackReport.communityId, ctx.community.id)))
		.run();
	// A report belonging to another community answers the same way as one that
	// does not exist.
	if (changed.changes === 0) error(404, 'Not found');
}

/**
 * The open reports across the instance, as Markdown a proposal starts from.
 *
 * Grouped by route rather than by community, because that is the shape of the
 * work: three people confused by the same screen is one proposal, and three
 * communities each confused by something different is three.
 */
export function feedbackAsMarkdown(db: Db, now: number): string {
	const rows = db
		.select({
			route: feedbackReport.route,
			kind: feedbackReport.kind,
			body: feedbackReport.body,
			createdAt: feedbackReport.createdAt,
			community: community.name
		})
		.from(feedbackReport)
		.leftJoin(community, eq(community.id, feedbackReport.communityId))
		.where(isNull(feedbackReport.handledAt))
		.orderBy(feedbackReport.route, desc(feedbackReport.createdAt))
		.all();

	const lines = [
		`# Pilot feedback, ${new Date(now).toISOString().slice(0, 10)}`,
		'',
		rows.length === 0 ? '_Nothing open._' : `${rows.length} open report(s).`,
		''
	];

	let route: string | null = null;
	for (const row of rows) {
		if (row.route !== route) {
			route = row.route;
			lines.push(`## ${route}`, '');
		}
		lines.push(
			`- **${row.kind}** · ${row.community ?? 'unknown community'} · ${new Date(row.createdAt).toISOString().slice(0, 10)}`,
			`  > ${row.body.replace(/\n+/g, ' ')}`,
			''
		);
	}

	return lines.join('\n');
}

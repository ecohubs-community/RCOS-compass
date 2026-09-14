import { and, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { changeLog } from '../db/schema/decisions.js';
import { decision } from '../db/schema/decisions.js';
import { communityArtifact, definition } from '../db/schema/definitions.js';
import { community } from '../db/schema/tenancy.js';
import { reindex } from './visibility.js';

/**
 * Making something readable by the world, and taking it back.
 * UI spec §1.6, §4.8, RCOS Appendix C.6.
 *
 * Publishing is a governance act, not a settings toggle. The register is where
 * governance acts live, so both directions write to it — a community that later
 * asks "when did this go public, and who agreed?" gets an answer, and one that
 * quietly withdrew something has a gap in the record exactly where somebody
 * will look.
 *
 * ## Two gates, and why the second is not redundant
 *
 * A page is public when the **community** has a public presence *and* the
 * **subject** is world-visible. `public_index_enabled` answers "does this
 * community have a public face at all", which is a different question from "is
 * this artifact public" — and having both means a community can withdraw its
 * whole public presence for a month without unpublishing eleven artifacts one
 * at a time, and can prepare its first publication without acquiring a public
 * URL as a side effect.
 */

/**
 * What a community may publish — deliberately narrower than what it may
 * restrict. Uploaded documents are restrictable (a transparency exception can
 * hide one) but never publishable: the upload control promises "nothing is
 * published outside the community", and uploaded bylaws carry names and
 * histories. One list, used by this service and by the settings route, so the
 * two cannot drift and the compiler rejects `{ type: 'document' }` at the call.
 */
export const PUBLISHABLE = ['definition', 'decision', 'artifact'] as const;
export type Publishable = (typeof PUBLISHABLE)[number];
export type PublishableSubject = { type: Publishable; id: string };

const TABLES = { definition, decision, artifact: communityArtifact } as const satisfies Record<
	Publishable,
	unknown
>;

export function publish(ctx: Ctx, subject: PublishableSubject, options: { db?: Db } = {}): void {
	setPublished(ctx, [subject], true, options);
}

export function withdraw(ctx: Ctx, subject: PublishableSubject, options: { db?: Db } = {}): void {
	setPublished(ctx, [subject], false, options);
}

/**
 * Publish or withdraw several subjects as one act.
 *
 * An RCOS artifact is a shape in the standard rather than a row, so publishing
 * one means publishing every definition that answers it — and that has to be
 * all or nothing. Doing them one at a time meant a refusal on the third left the
 * first two public while the screen reported failure, which is a community's
 * public page saying something nobody agreed to.
 */
export function publishAll(
	ctx: Ctx,
	subjects: PublishableSubject[],
	options: { db?: Db } = {}
): void {
	setPublished(ctx, subjects, true, options);
}

export function withdrawAll(
	ctx: Ctx,
	subjects: PublishableSubject[],
	options: { db?: Db } = {}
): void {
	setPublished(ctx, subjects, false, options);
}

function setPublished(
	ctx: Ctx,
	subjects: PublishableSubject[],
	toWorld: boolean,
	options: { db?: Db } = {}
): void {
	requirePermission(ctx, 'artifact.publish');
	requireWritableCommunity(ctx);

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	db.transaction((tx) => {
		for (const subject of subjects) applyOne(tx as unknown as Db, ctx, subject, toWorld, now);
	});
}

/**
 * One subject, inside a transaction the caller owns.
 *
 * A refusal here throws, and better-sqlite3 rolls the whole transaction back —
 * which is the point: a 409 on the third definition must leave the first two
 * exactly as they were.
 */
function applyOne(
	tx: Db,
	ctx: Ctx,
	subject: PublishableSubject,
	toWorld: boolean,
	now: Date
): void {
	// The type already excludes documents; this is for a caller the compiler
	// never saw — a form value cast, a script. Thrown before anything is
	// written, so a batch holding one document publishes nothing.
	if (!(PUBLISHABLE as readonly string[]).includes(subject.type)) {
		error(409, 'Uploaded documents stay inside the community.');
	}
	const table = TABLES[subject.type];
	const current = tx
		.select({ visibility: table.visibility, firstPublishedAt: table.firstPublishedAt })
		.from(table)
		.where(and(eq(table.id, subject.id), eq(table.communityId, ctx.community.id)))
		.get();
	if (!current) error(404, 'Not found');

	if (current.visibility === 'restricted') {
		// Publishing something the community decided to hide would be two
		// governance acts contradicting each other, silently. Ending the
		// exception is a deliberate step, and it has its own record.
		error(409, 'This is restricted. End the transparency exception before publishing it.');
	}
	if (toWorld === (current.visibility === 'world')) return;

	tx.update(table)
		.set({
			visibility: toWorld ? 'world' : 'member',
			/**
			 * Set once and never cleared. It is what lets a withdrawn page answer
			 * 410 and one that was never published answer 404 — current
			 * visibility cannot tell those apart, and reconstructing it from the
			 * register would put a query over the decision table on every 404 of
			 * a public route, which is the first thing a crawler finds.
			 */
			firstPublishedAt: toWorld ? (current.firstPublishedAt ?? now) : current.firstPublishedAt
		})
		.where(and(eq(table.id, subject.id), eq(table.communityId, ctx.community.id)))
		.run();

	// In the same transaction, as every other visibility change is.
	reindex(tx, ctx.community.id, subject);

	tx.insert(changeLog)
		.values({
			id: newId(),
			communityId: ctx.community.id,
			at: now,
			actorId: ctx.user.id,
			kind: toWorld ? 'visibility.published' : 'visibility.withdrawn',
			subjectType: subject.type,
			subjectId: subject.id,
			summary: toWorld ? 'Published to the world' : 'Withdrawn from the world',
			payload: null
		})
		.run();
}

/**
 * Switch the community's public presence on or off.
 *
 * Recorded like the rest. A community appearing on the public web for the first
 * time is the single most consequential setting in the product, and the one a
 * member is most likely to ask about afterwards.
 */
export function setPublicIndex(ctx: Ctx, enabled: boolean, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'artifact.publish');
	requireWritableCommunity(ctx);

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	db.transaction((tx) => {
		const changed = tx
			.update(community)
			.set({ publicIndexEnabled: enabled, updatedAt: now })
			.where(
				and(
					eq(community.id, ctx.community.id),
					sql`${community.publicIndexEnabled} != ${enabled ? 1 : 0}`
				)
			)
			.run();
		if (changed.changes === 0) return;

		tx.insert(changeLog)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				at: now,
				actorId: ctx.user.id,
				kind: enabled ? 'community.public_index_on' : 'community.public_index_off',
				subjectType: 'community',
				subjectId: ctx.community.id,
				summary: enabled
					? 'Turned on this community’s public pages'
					: 'Turned off this community’s public pages',
				payload: null
			})
			.run();
	});
}

/** Everything this community has published, for its own settings screen. */
export function publishedSubjects(
	ctx: Ctx,
	options: { db?: Db } = {}
): { type: Publishable; id: string; firstPublishedAt: number | null }[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	return PUBLISHABLE.flatMap((type) =>
		db
			.select({ id: TABLES[type].id, firstPublishedAt: TABLES[type].firstPublishedAt })
			.from(TABLES[type])
			.where(
				and(eq(TABLES[type].communityId, ctx.community.id), eq(TABLES[type].visibility, 'world'))
			)
			.all()
			.map((row) => ({
				type,
				id: row.id,
				firstPublishedAt: row.firstPublishedAt?.getTime() ?? null
			}))
	);
}

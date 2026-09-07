import { and, eq, isNull, lte } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { changeLog } from '../db/schema/decisions.js';
import { communityArtifact, definition } from '../db/schema/definitions.js';
import { decision } from '../db/schema/decisions.js';
import { document } from '../db/schema/documents.js';
import {
	transparencyException,
	type ExceptionAudience,
	type Restrictable,
	type TransparencyException
} from '../db/schema/visibility.js';

/**
 * Hiding something from a fellow member, as an auditable act.
 * UI spec §1.6, RCOS §5.3.5.
 *
 * `restricted` is the only one of the three levels that is not simply a value
 * somebody sets. The standard requires an exception to be explicitly defined,
 * justified, time-bounded and still compatible with compliance auditing — so
 * the state and its justification are written in one transaction, and a
 * restricted subject with no reason attached is a shape the service cannot
 * produce.
 */

/** The four things a community can restrict, and where each lives. */
const TABLES = {
	definition,
	decision,
	document,
	artifact: communityArtifact
} as const;

export type Subject = { type: Restrictable; id: string };

export type Restriction = {
	justification: string;
	audience: ExceptionAudience;
	expiresAt: Date;
	/** The decision that authorised it, where the community recorded one. */
	decisionId?: string | null;
};

/** The live exception for a subject, if it has one. */
export function liveException(
	db: Db,
	communityId: string,
	subject: Subject
): TransparencyException | null {
	return (
		db
			.select()
			.from(transparencyException)
			.where(
				and(
					eq(transparencyException.communityId, communityId),
					eq(transparencyException.subjectType, subject.type),
					eq(transparencyException.subjectId, subject.id),
					isNull(transparencyException.expiredAt)
				)
			)
			.get() ?? null
	);
}

/**
 * Restrict a subject, with the reason it is restricted and the date it stops.
 *
 * Both writes or neither. A subject sitting at `restricted` with no exception
 * would be invisible to half the community with nothing to point at, and the
 * expiry job would never free it — the two rows are one act.
 */
export function restrict(
	ctx: Ctx,
	subject: Subject,
	input: Restriction,
	options: { db?: Db } = {}
): TransparencyException {
	requirePermission(ctx, 'exception.create');
	requireWritableCommunity(ctx);

	const justification = input.justification.trim();
	// Refused here as well as by the CHECK, so somebody sees a sentence rather
	// than a constraint name — and because "justified" is the whole point.
	if (!justification) error(400, 'Say why this has to be restricted.');
	if (input.expiresAt.getTime() <= ctx.now()) {
		error(400, 'An exception has to end at some point in the future.');
	}

	const db = options.db ?? getDb();
	const table = TABLES[subject.type];
	const id = newId();
	const now = new Date(ctx.now());

	return db.transaction((tx) => {
		const existing = liveException(tx as unknown as Db, ctx.community.id, subject);
		if (existing) error(409, 'This is already restricted.');

		const updated = tx
			.update(table)
			.set({ visibility: 'restricted' })
			.where(and(eq(table.id, subject.id), eq(table.communityId, ctx.community.id)))
			.run();
		if (updated.changes === 0) error(404, 'Not found');

		tx.insert(transparencyException)
			.values({
				id,
				communityId: ctx.community.id,
				subjectType: subject.type,
				subjectId: subject.id,
				audience: input.audience,
				justification,
				decisionId: input.decisionId ?? null,
				expiresAt: input.expiresAt,
				expiredAt: null,
				renewsId: null,
				createdBy: ctx.user.id,
				createdAt: now
			})
			.run();

		writeChange(tx as unknown as Db, ctx.community.id, ctx.user.id, now, {
			kind: 'visibility.restricted',
			subject,
			summary: justification
		});

		return tx.select().from(transparencyException).where(eq(transparencyException.id, id)).get()!;
	});
}

/**
 * Extend an exception, keeping the one it replaces readable.
 *
 * The old justification stays: "why is this still hidden" is the question an
 * auditor asks, and an exception that overwrites its own history answers it
 * with whatever was most recently typed.
 */
export function renewException(
	ctx: Ctx,
	subject: Subject,
	input: Restriction,
	options: { db?: Db } = {}
): TransparencyException {
	requirePermission(ctx, 'exception.create');
	requireWritableCommunity(ctx);

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	return db.transaction((tx) => {
		const scoped = tx as unknown as Db;
		const existing = liveException(scoped, ctx.community.id, subject);
		if (!existing) error(404, 'Not found');

		tx.update(transparencyException)
			.set({ expiredAt: now })
			.where(eq(transparencyException.id, existing.id))
			.run();

		const id = newId();
		tx.insert(transparencyException)
			.values({
				id,
				communityId: ctx.community.id,
				subjectType: subject.type,
				subjectId: subject.id,
				audience: input.audience,
				justification: input.justification.trim(),
				decisionId: input.decisionId ?? null,
				expiresAt: input.expiresAt,
				expiredAt: null,
				renewsId: existing.id,
				createdBy: ctx.user.id,
				createdAt: now
			})
			.run();

		return tx.select().from(transparencyException).where(eq(transparencyException.id, id)).get()!;
	});
}

/** Everything this community is hiding, and why. Readable by every member. */
export function listExceptions(ctx: Ctx, options: { db?: Db } = {}): TransparencyException[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	return db
		.select()
		.from(transparencyException)
		.where(eq(transparencyException.communityId, ctx.community.id))
		.all();
}

/**
 * Revert everything whose exception has run out, and say so in the change log.
 *
 * Restriction that quietly continues past its stated end is the failure mode
 * the expiry exists to prevent, so the reverting is visible rather than merely
 * correct. Idempotent: a second run finds nothing left to expire, which is what
 * makes it safe to arm on a schedule.
 */
export function expireExceptions(db: Db, now: number): { expired: number } {
	const due = db
		.select()
		.from(transparencyException)
		.where(
			and(
				isNull(transparencyException.expiredAt),
				lte(transparencyException.expiresAt, new Date(now))
			)
		)
		.all();

	let expired = 0;
	for (const row of due) {
		const table = TABLES[row.subjectType];
		db.transaction((tx) => {
			tx.update(table)
				.set({ visibility: 'member' })
				.where(and(eq(table.id, row.subjectId), eq(table.communityId, row.communityId)))
				.run();
			tx.update(transparencyException)
				.set({ expiredAt: new Date(now) })
				.where(eq(transparencyException.id, row.id))
				.run();
			writeChange(tx as unknown as Db, row.communityId, null, new Date(now), {
				kind: 'visibility.exception_expired',
				subject: { type: row.subjectType, id: row.subjectId },
				summary: row.justification
			});
		});
		expired += 1;
	}
	return { expired };
}

function writeChange(
	db: Db,
	communityId: string,
	actorId: string | null,
	at: Date,
	entry: { kind: string; subject: Subject; summary: string }
): void {
	db.insert(changeLog)
		.values({
			id: newId(),
			communityId,
			at,
			actorId,
			kind: entry.kind,
			subjectType: entry.subject.type,
			subjectId: entry.subject.id,
			summary: entry.summary,
			payload: null
		})
		.run();
}

import { and, eq, inArray } from 'drizzle-orm';
import type { Ctx } from '../auth/guard.js';
import { requireRead, visibleTo } from '../auth/visible-to.js';
import type { Db } from '../db/index.js';
import { decision } from '../db/schema/decisions.js';
import { definition } from '../db/schema/definitions.js';
import { discussion } from '../db/schema/discussions.js';
import { document } from '../db/schema/documents.js';
import { producedFile } from '../db/schema/self-audit.js';
import type { SubjectType } from '../../notifications/kinds.js';

/**
 * Whether what a notification is about is still there for this member, and
 * where it is. `openspec/changes/notifications-page`, design.md "What is shown
 * when the subject is no longer visible".
 *
 * A title stored when a decision was announced must not outlive the member's
 * right to read that decision. So a list is checked against the same
 * visibility filter every read path uses — one query per subject type, however
 * many notifications there are — and an item whose subject is gone or hidden
 * is shown without its words.
 *
 * Answers a *target*, not an href: services know nothing of routes, and the
 * screen turns a target into a link with `links`.
 */
export type NotificationTarget =
	| { type: 'discussion'; id: string }
	| { type: 'decision'; ref: string }
	| { type: 'definition'; id: string }
	| { type: 'document'; id: string }
	| { type: 'export' }
	| { type: 'community' };

const key = (type: string, id: string) => `${type}:${id}`;

export function notificationTargets(
	db: Db,
	ctx: Ctx,
	subjects: readonly { subjectType: string; subjectId: string }[]
): Map<string, NotificationTarget> {
	const audience = requireRead(ctx);
	const communityId = ctx.community.id;
	const byType = new Map<string, string[]>();
	for (const { subjectType, subjectId } of subjects) {
		byType.set(subjectType, [...new Set([...(byType.get(subjectType) ?? []), subjectId])]);
	}

	const found = new Map<string, NotificationTarget>();
	for (const [type, ids] of byType as Map<SubjectType, string[]>) {
		switch (type) {
			case 'discussion':
				for (const row of db
					.select({ id: discussion.id })
					.from(discussion)
					.where(and(eq(discussion.communityId, communityId), inArray(discussion.id, ids)))
					.all()) {
					found.set(key(type, row.id), { type, id: row.id });
				}
				break;
			case 'decision':
				for (const row of db
					.select({ id: decision.id, ref: decision.ref })
					.from(decision)
					.where(
						and(
							eq(decision.communityId, communityId),
							inArray(decision.id, ids),
							visibleTo(audience, decision.visibility)
						)
					)
					.all()) {
					found.set(key(type, row.id), { type, ref: row.ref });
				}
				break;
			case 'definition':
				for (const row of db
					.select({ id: definition.id })
					.from(definition)
					.where(
						and(
							eq(definition.communityId, communityId),
							inArray(definition.id, ids),
							visibleTo(audience, definition.visibility)
						)
					)
					.all()) {
					found.set(key(type, row.id), { type, id: row.id });
				}
				break;
			case 'document':
				for (const row of db
					.select({ id: document.id })
					.from(document)
					.where(
						and(
							eq(document.communityId, communityId),
							inArray(document.id, ids),
							visibleTo(audience, document.visibility)
						)
					)
					.all()) {
					found.set(key(type, row.id), { type, id: row.id });
				}
				break;
			case 'export':
				for (const row of db
					.select({ id: producedFile.id })
					.from(producedFile)
					.where(and(eq(producedFile.communityId, communityId), inArray(producedFile.id, ids)))
					.all()) {
					found.set(key(type, row.id), { type });
				}
				break;
			case 'community':
				for (const id of ids) if (id === communityId) found.set(key(type, id), { type });
				break;
		}
	}
	return found;
}

/** One subject, for opening a single notification. Null: gone, or not for this member. */
export function notificationTarget(
	db: Db,
	ctx: Ctx,
	subjectType: string,
	subjectId: string
): NotificationTarget | null {
	return (
		notificationTargets(db, ctx, [{ subjectType, subjectId }]).get(key(subjectType, subjectId)) ??
		null
	);
}

export const targetKey = key;

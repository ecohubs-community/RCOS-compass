import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { notification, type Notification } from '../db/schema/notifications.js';
import { discussion, post } from '../db/schema/discussions.js';
import { consentEligible } from '../db/schema/discussions.js';
import { membership } from '../db/schema/tenancy.js';
import { registerTenantService } from './registry.js';

/**
 * What a member is told. UI spec §4.11.
 *
 * One row per recipient, written **inside the transaction that caused them**. A
 * decision that exists and told nobody is a decision half the community will
 * find out about by accident, so the rows are atomic with the act rather than
 * enqueued after it.
 *
 * Mail is the part that must never hold a write lock, and mail is the weekly
 * digest — a job, reading these same rows.
 *
 * Notifications are keyed by membership, not by user: a person in two
 * communities has two lists, and a membership that ends takes its notifications
 * out of reach with it.
 */

export type NotificationKind =
	'proposal.posted' | 'consent.opened' | 'decision.frozen' | 'definition.review_due';

export type NotifyInput = {
	kind: NotificationKind;
	subjectType: 'discussion' | 'decision' | 'definition';
	subjectId: string;
	/** A short line. Never a definition body — that is what the link is for. */
	summary: string;
	recipients: string[];
};

/**
 * Write the rows, skipping the person who caused them.
 *
 * Nobody needs telling about their own act, and a list full of your own doing is
 * a list people stop opening.
 */
export function notify(db: Db, ctx: Ctx, input: NotifyInput): number {
	const now = ctx.now();
	const recipients = [...new Set(input.recipients)].filter((id) => id !== ctx.membership.id);

	for (const recipientMembershipId of recipients) {
		db.insert(notification)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				recipientMembershipId,
				kind: input.kind,
				subjectType: input.subjectType,
				subjectId: input.subjectId,
				summary: input.summary,
				createdAt: new Date(now),
				readAt: null
			})
			.run();
	}

	return recipients.length;
}

/** Everyone still in the community. The audience for a decision. */
export function activeMemberships(db: Db, communityId: string): string[] {
	return db
		.select({ id: membership.id })
		.from(membership)
		.where(and(eq(membership.communityId, communityId), isNull(membership.endedAt)))
		.all()
		.map((row) => row.id);
}

/**
 * Everyone who has written in a thread, plus whoever opened it.
 *
 * The audience for a proposal: people who showed they care about this question,
 * rather than everyone, because a notification everyone gets is a notification
 * nobody reads.
 */
export function discussionParticipants(
	db: Db,
	communityId: string,
	discussionId: string
): string[] {
	const thread = db.select().from(discussion).where(eq(discussion.id, discussionId)).get();
	if (!thread) return [];

	const authors = db
		.select({ authorId: post.authorId })
		.from(post)
		.where(eq(post.discussionId, discussionId))
		.all()
		.map((row) => row.authorId)
		.filter((id): id is string => id !== null);

	const userIds = new Set([...authors, thread.openedBy].filter((id): id is string => id !== null));
	if (userIds.size === 0) return [];

	return db
		.select({ id: membership.id, userId: membership.userId })
		.from(membership)
		.where(and(eq(membership.communityId, communityId), isNull(membership.endedAt)))
		.all()
		.filter((row) => userIds.has(row.userId))
		.map((row) => row.id);
}

/** Everyone a consent round entitled to answer. */
export function roundAudience(db: Db, roundId: string): string[] {
	return db
		.select({ id: consentEligible.membershipId })
		.from(consentEligible)
		.where(eq(consentEligible.roundId, roundId))
		.all()
		.map((row) => row.id);
}

export function listNotifications(ctx: Ctx, options: { db?: Db } = {}): Notification[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	// Keyed by *this* membership in *this* community: two lists never mix, and a
	// membership that has ended reaches none of them.
	return db
		.select()
		.from(notification)
		.where(
			and(
				eq(notification.communityId, ctx.community.id),
				eq(notification.recipientMembershipId, ctx.membership.id)
			)
		)
		.orderBy(desc(notification.createdAt))
		.limit(200)
		.all();
}

export function unreadCount(ctx: Ctx, options: { db?: Db } = {}): number {
	return listNotifications(ctx, options).filter((row) => row.readAt === null).length;
}

/**
 * Marking read — the one write a suspended community may still do, because it
 * changes nothing anyone agreed.
 *
 * A notification that is not the caller's is reported as one that does not
 * exist, rather than skipped: silently ignoring an id is how a bug in the caller
 * goes unnoticed for a year, and it is the same answer the tenant boundary gives
 * everywhere else.
 */
export function markRead(ctx: Ctx, ids: string[], options: { db?: Db } = {}): number {
	requirePermission(ctx, 'community.read');
	if (ids.length === 0) return 0;

	const db = options.db ?? getDb();
	const mine = new Set(listNotifications(ctx, options).map((row) => row.id));
	for (const id of ids) {
		if (!mine.has(id)) error(404, 'Not found');
	}

	db.update(notification)
		.set({ readAt: new Date(ctx.now()) })
		.where(inArray(notification.id, ids))
		.run();

	return ids.length;
}

registerTenantService({
	name: 'notifications.markRead',
	subject: 'notification',
	call: (ctx, subjectId) => markRead(ctx, [subjectId])
});

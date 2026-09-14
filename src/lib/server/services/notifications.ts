import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { notification, type Notification } from '../db/schema/notifications.js';
import { discussion, post } from '../db/schema/discussions.js';
import { consentEligible } from '../db/schema/discussions.js';
import { membership } from '../db/schema/tenancy.js';
import { registerTenantService } from './registry.js';
import { user } from '../db/schema/auth.js';
import { personLabel } from './person.js';
import {
	notificationTarget,
	notificationTargets,
	targetKey,
	type NotificationTarget
} from './notification-subjects.js';
import type {
	NotificationItem,
	NotificationKind,
	NotificationParams,
	SubjectType
} from '../../notifications/kinds.js';

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

export type { NotificationKind } from '../../notifications/kinds.js';

export type NotifyInput<K extends NotificationKind = NotificationKind> = {
	kind: K;
	subjectType: SubjectType;
	subjectId: string;
	/**
	 * An English line, kept for the rows' own sake — the digest's titles, and the
	 * last resort if a kind ever loses its message. What a member reads is built
	 * from `params` when it is shown.
	 */
	summary: string;
	/** What the text is built from. Never a name or an address: people are membership ids. */
	params: NotificationParams[K];
	recipients: string[];
	/**
	 * Tell the member the context belongs to as well. For the outcome of a *job*
	 * they started — an export built, a scan finished — where `ctx` is rebuilt for
	 * that member and "their own act" is exactly what they are waiting to hear
	 * about. Without it, `export.ready` was filtered out for its only recipient
	 * and never written.
	 */
	includeActor?: boolean;
};

/**
 * Write the rows, for current members of this community only, skipping the
 * person who caused them unless asked not to.
 *
 * Who may receive is decided here, once, whatever the caller passed: a
 * membership of another community or one that has ended gets nothing. It was
 * each caller's job to remember that, and there are about to be twice as many
 * callers. Nobody needs telling about their own act either — but the end of a
 * job they started is not their act; see `includeActor`.
 */
export function notify<K extends NotificationKind>(
	db: Db,
	ctx: Ctx,
	input: NotifyInput<K>
): number {
	const now = ctx.now();
	const named = [...new Set(input.recipients)].filter(
		(id) => input.includeActor === true || id !== ctx.membership.id
	);
	const recipients = currentMembers(db, ctx.community.id, named);

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
				params: input.params as Record<string, unknown>,
				createdAt: new Date(now),
				readAt: null
			})
			.run();
	}

	return recipients.length;
}

/**
 * A reply, told to the thread's participants — collapsed. A recipient who still
 * has an unread reply notification for this discussion has it counted up and
 * brought to the top instead of getting another row; one who has read theirs
 * gets a new one. Ten replies in an afternoon are one line that says ten.
 */
export function notifyReply(
	db: Db,
	ctx: Ctx,
	input: { discussionId: string; title: string; recipients: string[] }
): number {
	const now = new Date(ctx.now());
	const recipients = currentMembers(
		db,
		ctx.community.id,
		[...new Set(input.recipients)].filter((id) => id !== ctx.membership.id)
	);
	if (recipients.length === 0) return 0;

	const unread = new Map(
		db
			.select()
			.from(notification)
			.where(
				and(
					eq(notification.communityId, ctx.community.id),
					inArray(notification.recipientMembershipId, recipients),
					eq(notification.kind, 'discussion.reply'),
					eq(notification.subjectId, input.discussionId),
					isNull(notification.readAt)
				)
			)
			.all()
			.map((row) => [row.recipientMembershipId, row])
	);

	for (const [, row] of unread) {
		const count = Number((row.params as { count?: unknown } | null)?.count ?? 1) + 1;
		db.update(notification)
			.set({
				params: { title: input.title, count },
				summary: `${count} new replies in ${input.title}`,
				createdAt: now
			})
			.where(eq(notification.id, row.id))
			.run();
	}

	const fresh = recipients.filter((id) => !unread.has(id));
	notify(db, ctx, {
		kind: 'discussion.reply',
		subjectType: 'discussion',
		subjectId: input.discussionId,
		summary: `A new reply in ${input.title}`,
		params: { title: input.title, count: 1 },
		recipients: fresh
	});
	return recipients.length;
}

/**
 * The current memberships of this community a text mentions by number, without
 * the author. A number that belongs to nobody here — another community's, a
 * former member's, a typo — mentions nobody.
 */
export function mentionedMembers(db: Db, ctx: Ctx, seqs: number[]): string[] {
	if (seqs.length === 0) return [];
	return db
		.select({ id: membership.id })
		.from(membership)
		.where(
			and(
				eq(membership.communityId, ctx.community.id),
				inArray(membership.seq, seqs),
				isNull(membership.endedAt)
			)
		)
		.all()
		.map((row) => row.id)
		.filter((id) => id !== ctx.membership.id);
}

/** The ids, of those given, that are current memberships of this community. */
export function currentMembers(db: Db, communityId: string, ids: string[]): string[] {
	if (ids.length === 0) return [];
	const found = new Set(
		db
			.select({ id: membership.id })
			.from(membership)
			.where(
				and(
					eq(membership.communityId, communityId),
					isNull(membership.endedAt),
					inArray(membership.id, ids)
				)
			)
			.all()
			.map((row) => row.id)
	);
	return ids.filter((id) => found.has(id));
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

/**
 * Counted in the database, not over the page of rows a screen shows.
 *
 * `listNotifications` is capped at 200 because a list is; the badge is not, and
 * a member with 250 unread would have been told 200.
 */
export function unreadCount(ctx: Ctx, options: { db?: Db } = {}): number {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const [row] = db
		.select({ n: count() })
		.from(notification)
		.where(
			and(
				eq(notification.communityId, ctx.community.id),
				eq(notification.recipientMembershipId, ctx.membership.id),
				isNull(notification.readAt)
			)
		)
		.all();
	return row?.n ?? 0;
}

export type NotificationView = NotificationItem & {
	/** Where opening it goes; null when the subject is gone or hidden from this member. */
	target: NotificationTarget | null;
};

/**
 * A member's notifications as a screen shows them: newest first, each checked
 * against what the member may still see, with people named through
 * `personLabel`. An item whose subject is gone or hidden carries no values and
 * no summary — only that it is no longer available.
 */
export function listNotificationItems(
	ctx: Ctx,
	options: { db?: Db; limit?: number } = {}
): NotificationView[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const rows = db
		.select()
		.from(notification)
		.where(
			and(
				eq(notification.communityId, ctx.community.id),
				eq(notification.recipientMembershipId, ctx.membership.id)
			)
		)
		.orderBy(desc(notification.createdAt))
		.limit(Math.min(options.limit ?? 200, 200))
		.all();
	if (rows.length === 0) return [];

	const targets = notificationTargets(db, ctx, rows);
	const actorIds = [
		...new Set(
			rows
				.map((row) => (row.params as { actor?: unknown } | null)?.actor)
				.filter((id): id is string => typeof id === 'string')
		)
	];
	const labels = new Map(
		actorIds.length === 0
			? []
			: db
					.select({
						id: membership.id,
						name: user.name,
						erasedAt: user.erasedAt,
						displayName: membership.displayName,
						seq: membership.seq
					})
					.from(membership)
					.innerJoin(user, eq(user.id, membership.userId))
					.where(
						and(eq(membership.communityId, ctx.community.id), inArray(membership.id, actorIds))
					)
					.all()
					.map((row) => [row.id, personLabel(row)])
	);

	return rows.map((row) => {
		const target = targets.get(targetKey(row.subjectType, row.subjectId)) ?? null;
		const available = target !== null;
		const actor = (row.params as { actor?: unknown } | null)?.actor;
		return {
			id: row.id,
			kind: row.kind,
			subjectType: row.subjectType,
			createdAt: row.createdAt.getTime(),
			unread: row.readAt === null,
			available,
			params: available ? (row.params ?? null) : null,
			summary: available ? row.summary : null,
			actor: available && typeof actor === 'string' ? (labels.get(actor) ?? null) : null,
			target
		};
	});
}

/**
 * Open one notification: mark it read and say where it leads — or null when its
 * subject is gone or hidden, which still marks it read.
 *
 * The one way a single notification becomes read, and it is reached only by a
 * form post (`/c/[slug]/notifications?/open`): preloading a link must never
 * read a member's notifications for them. A notification that is not the
 * caller's is reported as one that does not exist, rather than skipped — the
 * answer the tenant boundary gives everywhere else.
 */
export function openNotification(
	ctx: Ctx,
	id: string,
	options: { db?: Db } = {}
): NotificationTarget | null {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const row = db
		.select()
		.from(notification)
		.where(
			and(
				eq(notification.id, id),
				eq(notification.communityId, ctx.community.id),
				eq(notification.recipientMembershipId, ctx.membership.id)
			)
		)
		.get();
	if (!row) error(404, 'Not found');

	if (row.readAt === null) {
		db.update(notification)
			.set({ readAt: new Date(ctx.now()) })
			.where(eq(notification.id, row.id))
			.run();
	}
	return notificationTarget(db, ctx, row.subjectType, row.subjectId);
}

/**
 * Every unread notification of this member in this community, read. The one
 * write a suspended community still allows here, because it changes nothing
 * anyone agreed.
 */
export function markAllRead(ctx: Ctx, options: { db?: Db } = {}): number {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	return db
		.update(notification)
		.set({ readAt: new Date(ctx.now()) })
		.where(
			and(
				eq(notification.communityId, ctx.community.id),
				eq(notification.recipientMembershipId, ctx.membership.id),
				isNull(notification.readAt)
			)
		)
		.run().changes;
}

registerTenantService({
	name: 'notifications.open',
	subject: 'notification',
	call: (ctx, subjectId) => openNotification(ctx, subjectId)
});

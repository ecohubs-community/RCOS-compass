import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { community, membership } from './tenancy.js';

/**
 * What a member is told. UI spec §4.11, docs/03-data-model.md §3.
 *
 * One row per recipient rather than an event table joined to a read table: a
 * member's list is then a single indexed read and "mark all read" is one update.
 * The cost is a row per person per event, which for a community of 27 is nothing.
 *
 * Keyed by membership, not by user: a person in two communities has two
 * memberships and two lists, and a membership that ends takes its notifications
 * out of reach with it.
 */
export const notification = sqliteTable(
	'notification',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		recipientMembershipId: text('recipient_membership_id')
			.notNull()
			.references(() => membership.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		subjectType: text('subject_type').notNull(),
		subjectId: text('subject_id').notNull(),
		/** A short line. Never a definition body — that is what the link is for. */
		summary: text('summary').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		readAt: integer('read_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('notification_recipient_idx').on(table.recipientMembershipId, table.createdAt),
		index('notification_unread_idx').on(table.recipientMembershipId, table.readAt)
	]
);

export type Notification = typeof notification.$inferSelect;

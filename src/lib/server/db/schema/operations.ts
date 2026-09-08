import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community, membership } from './tenancy.js';

/**
 * What the people running the instance need in order to answer questions about
 * it. `docs/00-architecture.md` §11 and §12, `docs/05-admin-console.md` §3.5.
 *
 * Four small tables with one thing in common: they exist so that a fact about
 * the instance is *somewhere a person can look*, rather than in a log file
 * nobody tails or in whoever was on shift's memory. None of them holds a
 * community's content, and the constraints below are what keep it that way.
 */

/**
 * An unhandled error, grouped.
 *
 * One row per fingerprint rather than per occurrence, because the failure mode
 * of an error table is a broken route writing four hundred identical rows and
 * burying everything else. What a reader needs is *what is failing and how
 * badly*, which is a count.
 *
 * **No content, ever.** The message is scrubbed by the same module the logger
 * uses, so a definition body cannot arrive here by a route the logs would have
 * refused. That is why there is no `payload` column: a column that can hold
 * anything eventually holds a governance document.
 */
export const errorReport = sqliteTable(
	'error_report',
	{
		id: text('id').primaryKey(),
		/** Error name plus the top frames, hashed. Two of these are one problem. */
		fingerprint: text('fingerprint').notNull(),
		/** Scrubbed. Never the values interpolated into it. */
		message: text('message').notNull(),
		route: text('route'),
		/** The id the visitor was shown, so a report can be matched to a person's screenshot. */
		requestId: text('request_id'),
		communityId: text('community_id').references(() => community.id, { onDelete: 'set null' }),
		count: integer('count').notNull().default(1),
		firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		uniqueIndex('error_report_fingerprint_idx').on(table.fingerprint),
		index('error_report_last_seen_idx').on(table.lastSeenAt)
	]
);

/**
 * A send that failed, without the address it failed to reach.
 *
 * `docs/05` §3.5 asks the status page for mail delivery failures and nothing
 * recorded them. The recipient is deliberately absent: this table exists to make
 * operational problems visible, and putting an email address in it would make it
 * a second place personal data lives for no operational gain — the invitation or
 * membership id is what somebody debugging actually follows.
 */
export const mailFailure = sqliteTable(
	'mail_failure',
	{
		id: text('id').primaryKey(),
		/** Which message: an invitation, a verification, a digest. */
		kind: text('kind').notNull(),
		communityId: text('community_id').references(() => community.id, { onDelete: 'set null' }),
		/** What it was for — an invitation id, a membership id. Never an address. */
		subject: text('subject'),
		error: text('error').notNull(),
		at: integer('at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('mail_failure_at_idx').on(table.at)]
);

/**
 * Whether a community has reached an onboarding milestone. `docs/00` §12.
 *
 * A milestone, not a count: a community adopts its first definition once, and
 * the question this answers is "does onboarding work", not "what did anybody
 * do". The unique index is the enforcement — there is no second row to write,
 * so there is no accidental behavioural log.
 *
 * There is deliberately no member, no path and no session here. Adding one would
 * be a schema change and a review, which is the point.
 */
export const funnelEvent = sqliteTable(
	'funnel_event',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		at: integer('at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [uniqueIndex('funnel_event_once_idx').on(table.communityId, table.kind)]
);

/**
 * A legal document version somebody with the standing to do it has reviewed.
 *
 * Keyed by the **hash of the text**, not by the document's name. The text lives
 * in git where it is diffed and deployed with the code it describes; what a
 * database can usefully hold is the operational fact that one exact wording was
 * reviewed. Editing a word changes the hash, which re-arms the draft banner
 * without anybody having to remember to.
 */
export const legalReview = sqliteTable(
	'legal_review',
	{
		id: text('id').primaryKey(),
		/** `privacy`, `pilot-terms`, `sub-processors`. */
		document: text('document').notNull(),
		contentSha256: text('content_sha256').notNull(),
		reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
		reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }).notNull(),
		/** Who reviewed it, in words — "counsel", "the operator". */
		note: text('note')
	},
	(table) => [uniqueIndex('legal_review_version_idx').on(table.document, table.contentSha256)]
);

/**
 * A member saying something is wrong with a screen.
 *
 * The route and their words, and nothing else. A bug report that scooped up the
 * page's state would be a governance leak wearing a helpful hat — the half-
 * written definition somebody was looking at when they got confused is exactly
 * the text this product exists to keep inside the community.
 *
 * It references the membership rather than the user, like everything else that
 * has to survive an erasure.
 */
export const feedbackReport = sqliteTable(
	'feedback_report',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		membershipId: text('membership_id').references(() => membership.id, { onDelete: 'set null' }),
		/** The path they were on, so a report is about something. */
		route: text('route').notNull(),
		kind: text('kind', { enum: ['confusing', 'broken', 'missing', 'other'] })
			.notNull()
			.default('other'),
		body: text('body').notNull(),
		status: text('status', { enum: ['open', 'handled'] })
			.notNull()
			.default('open'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		handledAt: integer('handled_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('feedback_community_idx').on(table.communityId, table.createdAt),
		index('feedback_status_idx').on(table.status)
	]
);

export type ErrorReport = typeof errorReport.$inferSelect;
export type MailFailure = typeof mailFailure.$inferSelect;
export type FunnelEvent = typeof funnelEvent.$inferSelect;
export type LegalReview = typeof legalReview.$inferSelect;
export type FeedbackReport = typeof feedbackReport.$inferSelect;

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';

/**
 * Communities and the people in them. docs/03-data-model.md §3.
 *
 * Every tenant-owned table that follows carries `community_id`, indexed first,
 * and every service filters on it — the isolation is structural rather than
 * remembered (docs/04-security.md §2).
 */
export const community = sqliteTable(
	'community',
	{
		id: text('id').primaryKey(),
		/** The tenant address: /c/<slug>/… . Never held in the session. */
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		locale: text('locale').notNull().default('en'),
		/**
		 * Required, not optional: decision references are year-stamped in the
		 * community's own timezone, and "stalled 12 days" is user-visible.
		 */
		timezone: text('timezone').notNull().default('UTC'),
		status: text('status', { enum: ['active', 'suspended', 'deleted'] })
			.notNull()
			.default('active'),
		suspendedReason: text('suspended_reason'),
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
		/**
		 * Publishing an artifact must not publish personal data by default:
		 * outward attribution is roles and counts unless an attendee consents.
		 * docs/03-data-model.md §9.
		 */
		publishNamesPolicy: text('publish_names_policy', {
			enum: ['roles_and_counts', 'named_with_consent']
		})
			.notNull()
			.default('roles_and_counts'),
		aiEnabled: integer('ai_enabled', { mode: 'boolean' }).notNull().default(false),
		/** Null means "the instance default"; unlimited during the testing phase. */
		maxMembers: integer('max_members'),
		storageMb: integer('storage_mb'),
		aiMonthlyTokens: integer('ai_monthly_tokens'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		uniqueIndex('community_slug_idx').on(table.slug),
		index('community_status_idx').on(table.status)
	]
);

/** Which standard, at which version, this community is answering. */
export const communityStandard = sqliteTable(
	'community_standard',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		standardId: text('standard_id').notNull(),
		version: text('version').notNull(),
		status: text('status', { enum: ['active', 'migrating', 'retired'] })
			.notNull()
			.default('active'),
		adoptedAt: integer('adopted_at', { mode: 'timestamp_ms' }).notNull(),
		retiredAt: integer('retired_at', { mode: 'timestamp_ms' })
	},
	(table) => [uniqueIndex('community_standard_idx').on(table.communityId, table.standardId)]
);

/**
 * A person's place in one community.
 *
 * `role` is access control. `rcosState` is content the community governs and
 * MUST NOT authorise anything — a trial member's rights are whatever their
 * Membership Charter says, not something this application decides.
 * docs/04-security.md §1.
 */
export const membership = sqliteTable(
	'membership',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Two roles. `owner` is the flag below, never a role. */
		role: text('role', { enum: ['steward', 'member'] })
			.notNull()
			.default('member'),
		/** Exactly one per community; guards transfer and deletion only. */
		isOwner: integer('is_owner', { mode: 'boolean' }).notNull().default(false),
		rcosState: text('rcos_state', {
			enum: ['applicant', 'trial', 'full', 'exited', 'suspended']
		})
			.notNull()
			.default('full'),
		displayName: text('display_name'),
		joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
		/** Set when someone leaves; the record stays, the access does not. */
		endedAt: integer('ended_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		uniqueIndex('membership_community_user_idx').on(table.communityId, table.userId),
		index('membership_user_idx').on(table.userId),
		// One owner per community, and only among current members.
		uniqueIndex('membership_one_owner_idx')
			.on(table.communityId)
			.where(sql`${table.isOwner} = 1 and ${table.endedAt} is null`)
	]
);

export const invitation = sqliteTable(
	'invitation',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		role: text('role', { enum: ['steward', 'member'] })
			.notNull()
			.default('member'),
		/** The owner flag travels with the first invitation a new community gets. */
		grantsOwner: integer('grants_owner', { mode: 'boolean' }).notNull().default(false),
		/** Hashed at rest: the raw token exists only in the email. */
		tokenHash: text('token_hash').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
		acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'set null' }),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
		invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		uniqueIndex('invitation_token_idx').on(table.tokenHash),
		// One live invitation per address per community; re-inviting replaces.
		uniqueIndex('invitation_pending_idx')
			.on(table.communityId, table.email)
			.where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
		index('invitation_community_idx').on(table.communityId)
	]
);

/**
 * Append-only, platform-wide. Distinct from a community's own change log: this
 * records administrative and security events — sign-in failures, role changes,
 * exports, every admin action. docs/03-data-model.md §3.
 */
export const auditEvent = sqliteTable(
	'audit_event',
	{
		id: text('id').primaryKey(),
		at: integer('at', { mode: 'timestamp_ms' }).notNull(),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		/** Kept alongside the id so the trail survives the actor's deletion. */
		actorEmail: text('actor_email'),
		communityId: text('community_id').references(() => community.id, { onDelete: 'set null' }),
		action: text('action').notNull(),
		target: text('target'),
		ip: text('ip'),
		userAgent: text('user_agent'),
		meta: text('meta', { mode: 'json' })
	},
	(table) => [
		index('audit_at_idx').on(table.at),
		index('audit_community_idx').on(table.communityId, table.at),
		index('audit_action_idx').on(table.action)
	]
);

export type Community = typeof community.$inferSelect;
export type Membership = typeof membership.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type Role = Membership['role'];

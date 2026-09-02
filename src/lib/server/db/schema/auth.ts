import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Identity. These table shapes match what better-auth's Drizzle adapter expects
 * (docs/00-architecture.md §1), so the library manages sessions and verification
 * against them rather than a parallel set of its own.
 *
 * A user is a person, not a member: membership is per community and lives in
 * `tenancy.ts`. Nothing here knows about communities.
 */
export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		email: text('email').notNull(),
		/**
		 * Almost everything is withheld until this is true, and the platform-admin
		 * check requires it — docs/04-security.md §3, §6.
		 */
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
		image: text('image'),
		/** Interface language. Community content follows the community's locale. */
		locale: text('locale').notNull().default('en'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [uniqueIndex('user_email_idx').on(table.email)]
);

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		token: text('token').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		/** Sessions are bounded absolutely, not only by inactivity. */
		absoluteExpiresAt: integer('absolute_expires_at', { mode: 'timestamp_ms' }),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		uniqueIndex('session_token_idx').on(table.token),
		index('session_user_idx').on(table.userId)
	]
);

/** Credentials and third-party links, owned by better-auth. */
export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
		scope: text('scope'),
		idToken: text('id_token'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('account_user_idx').on(table.userId)]
);

/** Email verification, magic links, password resets. */
export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

/**
 * Second factor. Required for platform admins (docs/04-security.md §6) and
 * available to everyone else.
 */
export const twoFactor = sqliteTable(
	'two_factor',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		secret: text('secret').notNull(),
		backupCodes: text('backup_codes'),
		verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [uniqueIndex('two_factor_user_idx').on(table.userId)]
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;

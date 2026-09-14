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
		name: text('name').notNull().default(''),
		email: text('email').notNull(),
		/**
		 * Almost everything is withheld until this is true, and the platform-admin
		 * check requires it — docs/04-security.md §3, §6.
		 */
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
		image: text('image'),
		/**
		 * Owned by the two-factor plugin. It adds this column to `user`, so the
		 * schema has to carry it or every write fails — found by making the library
		 * actually sign someone up rather than by reading its source.
		 */
		twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
		/** Interface language. Community content follows the community's locale. */
		locale: text('locale').notNull().default('en'),
		/**
		 * Where this person reads times from — an IANA zone such as `Europe/Lisbon`.
		 * `openspec/changes/local-time`: set from their browser the first time they
		 * load a page without one, never overwritten by that detection again, and
		 * changeable on the account page. Null shows them the community's zone.
		 */
		timeZone: text('time_zone'),
		/**
		 * When this person asked to be forgotten. `docs/03-data-model.md` §10.
		 *
		 * The row stays and the person goes: name, address and avatar are cleared,
		 * every session and credential is deleted, and this timestamp is what every
		 * surface reads to know it must render a former-member label instead. The
		 * alternative — deleting the row — would null the membership references
		 * that prove eleven people attended a decision, and a tally that quietly
		 * loses a row is a falsified record.
		 *
		 * Nothing about the released address is kept, not even a hash: a hash of an
		 * email is recoverable by anybody who can guess the address, which is
		 * exactly the person the erasure was requested against.
		 */
		erasedAt: integer('erased_at', { mode: 'timestamp_ms' }),
		/** Who carried it out — them, or an administrator acting on their request. */
		erasedBy: text('erased_by'),
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
		/**
		 * Ours, not the library's: better-auth rolls `expiresAt` forward on
		 * activity, so without a second bound a session never truly ends. Nullable
		 * because better-auth writes sessions and does not know about it; the
		 * pipeline sets and enforces it.
		 */
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
		/** Required by better-auth; identifies the credential's issuer. */
		issuer: text('issuer').notNull(),
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
		backupCodes: text('backup_codes').notNull(),
		verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
		/** The plugin locks a factor out after repeated failures. */
		failedVerificationCount: integer('failed_verification_count').notNull().default(0),
		lockedUntil: integer('locked_until', { mode: 'timestamp_ms' })
	},
	(table) => [index('two_factor_user_idx').on(table.userId)]
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;

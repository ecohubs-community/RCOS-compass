import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The background job queue. docs/00-architecture.md §6.
 *
 * A row in the same SQLite database rather than an external queue: it keeps the
 * self-host story to one container, and it survives a restart, which an
 * in-memory queue does not. The cost is that the MVP runs as a single instance.
 *
 * Delivery is at-least-once. Every handler must be idempotent.
 */
export const job = sqliteTable(
	'job',
	{
		id: text('id').primaryKey(),
		kind: text('kind').notNull(),
		/** Handler input, JSON-encoded. Never contains secrets. */
		payload: text('payload', { mode: 'json' }).notNull(),
		status: text('status', {
			enum: ['pending', 'running', 'done', 'failed', 'dead']
		})
			.notNull()
			.default('pending'),
		/** Not eligible to run before this instant. Drives retry backoff. */
		runAfter: integer('run_after', { mode: 'timestamp_ms' }).notNull(),
		/** While claimed, no other worker may take it until this passes. */
		lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
		attempts: integer('attempts').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(5),
		lastError: text('last_error'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		// The claim query: pending work whose time has come, oldest first.
		index('job_claim_idx').on(table.status, table.runAfter),
		index('job_kind_idx').on(table.kind)
	]
);

export type Job = typeof job.$inferSelect;
export type NewJob = typeof job.$inferInsert;

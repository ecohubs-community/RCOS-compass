import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Sliding-window counters. docs/01-server-client-contract.md §5.
 *
 * In the same database as everything else, which is coherent with the
 * single-instance MVP (docs/00-architecture.md §6).
 */
export const rateLimitBucket = sqliteTable(
	'rate_limit_bucket',
	{
		/** e.g. `login:ip:203.0.113.4` — scope, dimension and subject. */
		key: text('key').notNull(),
		/** Window start, floored to the window size. */
		windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
		count: integer('count').notNull().default(0)
	},
	(table) => [primaryKey({ columns: [table.key, table.windowStart] })]
);

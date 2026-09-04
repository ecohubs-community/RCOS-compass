import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community } from './tenancy.js';

/**
 * What the AI seam is allowed to write, and the only thing it is allowed to
 * write. docs/00-architecture.md §4 rule 5, docs/04-security.md §5.3.
 *
 * Its own file so the boundary can be stated as a rule rather than a habit:
 * everything under `src/lib/server/ai/` may import *this* schema module and no
 * other. An AI task that reaches for a definition, a decision or a piece of
 * evidence fails the build rather than review — "no model output writes state"
 * is exactly the kind of invariant that survives three phases and then quietly
 * dies in a hurry.
 */

/**
 * One model call. docs/00-architecture.md §4 rule 5.
 *
 * `inputSha256` and never the input. Governance drafts are among the most
 * sensitive text a community holds, and a log that keeps them is a second copy
 * outside every control the application has.
 */
export const aiCall = sqliteTable(
	'ai_call',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		task: text('task').notNull(),
		model: text('model').notNull(),
		tokensIn: integer('tokens_in').notNull().default(0),
		tokensOut: integer('tokens_out').notNull().default(0),
		ms: integer('ms').notNull().default(0),
		inputSha256: text('input_sha256').notNull(),
		ok: integer('ok', { mode: 'boolean' }).notNull(),
		/** Why it failed, for the member. Never the model's raw output. */
		detail: text('detail'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('ai_call_community_idx').on(table.communityId, table.createdAt)]
);

/**
 * Rolled-up usage, for the limits in docs/04-security.md §5.3.
 *
 * Per member first and per community as the backstop, because the property that
 * matters is that one enthusiastic member cannot drain everyone else's month.
 */
export const aiUsage = sqliteTable(
	'ai_usage',
	{
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		/** Null for the community-wide row. */
		actorId: text('actor_id').references(() => user.id, { onDelete: 'cascade' }),
		/** `YYYY-MM-DD` in the community's timezone; empty for a month-only row. */
		periodDay: text('period_day').notNull(),
		/** `YYYY-MM`, likewise. */
		periodMonth: text('period_month').notNull(),
		tasks: integer('tasks').notNull().default(0),
		tokens: integer('tokens').notNull().default(0)
	},
	(table) => [
		uniqueIndex('ai_usage_idx').on(
			table.communityId,
			table.actorId,
			table.periodDay,
			table.periodMonth
		)
	]
);

export type AiCall = typeof aiCall.$inferSelect;

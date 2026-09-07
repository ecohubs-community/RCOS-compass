import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { community } from './tenancy.js';

/**
 * A dated record of what was true. UI spec §4.8, RCOS §10.1 and Appendix C.5.
 *
 * Not a recomputation — readiness is always live — but a **recorded act**: the
 * standard asks a community to be able to cite when it last checked itself, and
 * the public index shows that date. Immutable, because an audit somebody can
 * edit afterwards answers a different question than the one it was run to
 * answer.
 *
 * The snapshot is JSON rather than columns because it is a photograph, not a
 * model: it is written once, read whole, and never filtered or joined on
 * (`docs/00` §5's rule about JSON columns). What it must contain is in the
 * `self-audit` spec, and the shape is versioned with the application rather
 * than with a migration.
 */
export const selfAudit = sqliteTable(
	'self_audit',
	{
		id: text('id').primaryKey(),
		communityId: text('community_id')
			.notNull()
			.references(() => community.id, { onDelete: 'cascade' }),
		runBy: text('run_by').references(() => user.id, { onDelete: 'set null' }),
		runAt: integer('run_at', { mode: 'timestamp_ms' }).notNull(),
		/** The binary claim as it stood, kept out of the JSON so it can be listed. */
		compliant: integer('compliant', { mode: 'boolean' }).notNull(),
		snapshot: text('snapshot', { mode: 'json' }).notNull()
	},
	(table) => [index('self_audit_community_idx').on(table.communityId, table.runAt)]
);

export type SelfAudit = typeof selfAudit.$inferSelect;

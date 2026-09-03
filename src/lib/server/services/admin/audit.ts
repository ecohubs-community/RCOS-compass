import { getDb, type Db } from '../../db/index.js';
import { listAudit, type AuditAction } from '../audit.js';
import { listTenants } from './communities.js';

/**
 * The platform audit log, for the console. docs/05-admin-console.md §3.4.
 *
 * A thin layer over the append-only trail, and it exists so the admin routes
 * keep importing `services/admin/*` only — the rule the import-boundary test
 * enforces. It also does the one thing a raw query cannot: turn a community id
 * into a name, so an operator reading the page can tell which tenant an event
 * belongs to without holding ids in their head.
 *
 * Read-only, including for admins. There is no update and no delete anywhere
 * beneath this: a trail that can be edited answers no question worth asking.
 */

export type AuditFilters = {
	action?: string;
	communityId?: string;
	actor?: string;
	/** Page backwards through time. */
	before?: number;
	limit?: number;
};

export type AuditRow = {
	id: string;
	at: number;
	actorEmail: string | null;
	ip: string | null;
	action: string;
	target: string | null;
	communityId: string | null;
	communityName: string | null;
	/** The before/after summary §3.4 asks for, already flattened for display. */
	changes: { field: string; from: string; to: string }[];
	/** Anything in `meta` that is not a before/after pair. */
	notes: { key: string; value: string }[];
};

function show(value: unknown): string {
	if (value === null || value === undefined) return '—';
	if (typeof value === 'boolean') return value ? 'on' : 'off';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * Flatten `meta` into a diff.
 *
 * The services write `{ from, to }` — sometimes scalars, sometimes an object per
 * field — so both shapes are unpacked here rather than each service being made
 * to agree on one, which would be a migration of history as well as of code.
 */
function summarise(meta: unknown): Pick<AuditRow, 'changes' | 'notes'> {
	const changes: AuditRow['changes'] = [];
	const notes: AuditRow['notes'] = [];
	if (meta === null || typeof meta !== 'object') return { changes, notes };

	const record = meta as Record<string, unknown>;
	const { from, to, ...rest } = record;

	if (from !== undefined || to !== undefined) {
		const fromObject = from !== null && typeof from === 'object';
		const toObject = to !== null && typeof to === 'object';
		if (fromObject || toObject) {
			const fields = new Set([
				...Object.keys(fromObject ? (from as object) : {}),
				...Object.keys(toObject ? (to as object) : {})
			]);
			for (const field of [...fields].sort()) {
				const before = show((from as Record<string, unknown> | null)?.[field]);
				const after = show((to as Record<string, unknown> | null)?.[field]);
				if (before !== after) changes.push({ field, from: before, to: after });
			}
		} else {
			changes.push({ field: 'value', from: show(from), to: show(to) });
		}
	}

	for (const [key, value] of Object.entries(rest)) {
		notes.push({ key, value: show(value) });
	}

	return { changes, notes };
}

export function listPlatformAudit(filters: AuditFilters = {}, db: Db = getDb()): AuditRow[] {
	const names = new Map(listTenants(db).map((t) => [t.id, t.name]));

	return listAudit(
		{
			// The action list is a closed set in `services/audit`; anything else is
			// a filter nobody can match, so it is passed through and finds nothing
			// rather than being rejected as an error.
			action: filters.action ? (filters.action as AuditAction) : undefined,
			communityId: filters.communityId,
			before: filters.before,
			limit: filters.limit ?? 200
		},
		db
	)
		.filter((event) => {
			if (!filters.actor) return true;
			const needle = filters.actor.toLowerCase();
			return (event.actorEmail ?? '').includes(needle) || (event.ip ?? '').includes(needle);
		})
		.map((event) => ({
			id: event.id,
			at: event.at.getTime(),
			actorEmail: event.actorEmail,
			ip: event.ip,
			action: event.action,
			target: event.target,
			communityId: event.communityId,
			communityName: event.communityId ? (names.get(event.communityId) ?? null) : null,
			...summarise(event.meta)
		}));
}

/** The actions present in the trail, so the filter offers only real ones. */
export function auditActionsSeen(db: Db = getDb()): string[] {
	return [...new Set(listAudit({ limit: 500 }, db).map((event) => event.action))].sort();
}

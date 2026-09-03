import { and, desc, eq, lte } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { auditEvent } from '../db/schema/tenancy.js';

/**
 * The platform audit log. docs/03-data-model.md §3.
 *
 * Distinct from a community's own change log: this records administrative and
 * security events — sign-in failures, role changes, exports, every admin action.
 * It is append-only and has no update or delete, deliberately: a trail that can
 * be edited answers no question worth asking.
 *
 * The actor's address is stored alongside their id so the trail survives the
 * account being deleted (docs/03-data-model.md §10).
 */
export type AuditAction =
	| 'auth.signin.failed'
	| 'auth.signin.rate_limited'
	| 'auth.two_factor.enrolled'
	| 'auth.two_factor.removed'
	| 'member.invited'
	| 'member.invitation_revoked'
	| 'member.joined'
	| 'member.role_changed'
	| 'member.removed'
	| 'community.created'
	| 'community.renamed'
	| 'community.slug_changed'
	| 'community.limits_changed'
	| 'community.flags_changed'
	| 'community.suspended'
	| 'community.unsuspended'
	| 'community.deleted'
	| 'community.restored'
	| 'community.ownership_transferred'
	| 'community.exported';

export type AuditInput = {
	action: AuditAction;
	actorId?: string | null;
	actorEmail?: string | null;
	communityId?: string | null;
	target?: string | null;
	ip?: string | null;
	userAgent?: string | null;
	/** Never governance content; enough to answer "what changed". */
	meta?: Record<string, unknown> | null;
};

export function recordAudit(db: Db, clock: Clock, input: AuditInput): void {
	db.insert(auditEvent)
		.values({
			id: newId(),
			at: new Date(clock.now()),
			actorId: input.actorId ?? null,
			actorEmail: input.actorEmail?.toLowerCase() ?? null,
			communityId: input.communityId ?? null,
			action: input.action,
			target: input.target ?? null,
			ip: input.ip ?? null,
			userAgent: input.userAgent ?? null,
			meta: input.meta ?? null
		})
		.run();
}

export type AuditQuery = {
	communityId?: string;
	action?: AuditAction;
	before?: number;
	limit?: number;
};

/** Newest first — an operator reads this to find what just happened. */
export function listAudit(query: AuditQuery = {}, db: Db = getDb()) {
	const conditions = [
		query.communityId ? eq(auditEvent.communityId, query.communityId) : undefined,
		query.action ? eq(auditEvent.action, query.action) : undefined,
		query.before ? lte(auditEvent.at, new Date(query.before)) : undefined
	].filter((c): c is NonNullable<typeof c> => c !== undefined);

	return db
		.select()
		.from(auditEvent)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(auditEvent.at), desc(auditEvent.id))
		.limit(Math.min(query.limit ?? 100, 500))
		.all();
}

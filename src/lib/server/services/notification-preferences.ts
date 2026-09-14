import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { membership } from '../db/schema/tenancy.js';
import { registerTenantService } from './registry.js';

/**
 * What a member gets by email from one community. `openspec/changes/notifications-page`.
 *
 * Per membership, not per person: somebody in two communities may want the
 * lively one's digest weekly and nothing at all from the quiet one. In-app
 * notifications are not governed here — they are the record of what concerns a
 * member, and turning them off would be turning off the record.
 *
 * Only ever the caller's own. A steward manages memberships; they do not manage
 * what arrives in somebody else's inbox, so another member's id — in this
 * community or any other — is answered as not found.
 */
export type NotificationPreferences = {
	emailEnabled: boolean;
	/** 0 is Sunday … 6 is Saturday. */
	digestDay: number;
};

function ownSeat(ctx: Ctx, membershipId: string, db: Db) {
	requirePermission(ctx, 'community.read');
	if (membershipId !== ctx.membership.id) error(404, 'Not found');
	const seat = db
		.select()
		.from(membership)
		.where(and(eq(membership.id, membershipId), eq(membership.communityId, ctx.community.id)))
		.get();
	if (!seat) error(404, 'Not found');
	return seat;
}

export function notificationPreferences(
	ctx: Ctx,
	membershipId: string,
	options: { db?: Db } = {}
): NotificationPreferences {
	const seat = ownSeat(ctx, membershipId, options.db ?? getDb());
	return { emailEnabled: seat.emailEnabled, digestDay: seat.digestDay };
}

/**
 * Allowed while a community is suspended, like marking notifications read: what
 * reaches one member's inbox changes nothing anyone agreed.
 */
export function setNotificationPreferences(
	ctx: Ctx,
	membershipId: string,
	input: NotificationPreferences,
	options: { db?: Db } = {}
): NotificationPreferences {
	const db = options.db ?? getDb();
	ownSeat(ctx, membershipId, db);
	if (!Number.isInteger(input.digestDay) || input.digestDay < 0 || input.digestDay > 6) {
		error(400, 'Choose a day of the week.');
	}
	db.update(membership)
		.set({ emailEnabled: input.emailEnabled, digestDay: input.digestDay })
		.where(eq(membership.id, membershipId))
		.run();
	return { emailEnabled: input.emailEnabled, digestDay: input.digestDay };
}

registerTenantService({
	name: 'notificationPreferences.get',
	subject: 'membership',
	call: (ctx, id) => notificationPreferences(ctx, id)
});
registerTenantService({
	name: 'notificationPreferences.set',
	subject: 'membership',
	call: (ctx, id) => setNotificationPreferences(ctx, id, { emailEnabled: false, digestDay: 1 })
});

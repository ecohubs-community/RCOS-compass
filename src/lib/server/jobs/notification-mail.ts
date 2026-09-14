import { eq } from 'drizzle-orm';
import type { Ctx } from '../auth/guard.js';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { user, type User } from '../db/schema/auth.js';
import { notification } from '../db/schema/notifications.js';
import { community, membership } from '../db/schema/tenancy.js';
import { localeOf } from '../locale.js';
import { getMailTransport, notificationMessage, type ImmediateMail } from '../mail/index.js';
import { notificationTarget } from '../services/notification-subjects.js';
import { targetHref } from '../../notifications/href.js';
import { links } from '../../links.js';
import { formatMoment } from '../../time/format.js';
import { timeZoneFor } from '../../time/zone.js';

/**
 * A notification that is also an email, sent after the act that caused it has
 * committed. `openspec/changes/notifications-page`.
 *
 * A job, enqueued in the same transaction as the row, because mail must never
 * hold a write lock and a send that fails must not undo a role change. Everything
 * about whether to send is decided here, when it runs, rather than when it was
 * enqueued: a member who turned email off in the minute between, or left, gets
 * nothing.
 *
 * At-least-once, like every job: a worker that dies between the send and the
 * job completing sends twice. For one sentence and a link that is the better
 * failure than never sending.
 */
export type NotificationMailPayload =
	| { notificationId: string }
	/**
	 * The one email with no row behind it. A removed person can no longer open
	 * the community, so an in-app notification would be one they can never read.
	 */
	| { removal: { membershipId: string; communityName: string } };

export type MailOutcome = 'sent' | 'skipped';

const ROLES = new Set<'steward' | 'member'>(['steward', 'member']);

/** An address that is still theirs to be written to. */
const reachable = (person: User) => person.erasedAt === null && person.emailVerified;

export async function runNotificationMail(
	db: Db,
	clock: Clock,
	payload: NotificationMailPayload,
	appUrl: string
): Promise<MailOutcome> {
	if ('removal' in payload) return sendRemoval(db, payload.removal, appUrl);

	const found = db
		.select({ notification, membership, user, community })
		.from(notification)
		.innerJoin(membership, eq(membership.id, notification.recipientMembershipId))
		.innerJoin(user, eq(user.id, membership.userId))
		.innerJoin(community, eq(community.id, notification.communityId))
		.where(eq(notification.id, payload.notificationId))
		.get();
	if (!found) return 'skipped';
	const { notification: row, membership: seat, user: person, community: home } = found;
	if (seat.endedAt || !seat.emailEnabled || !reachable(person) || home.status !== 'active') {
		return 'skipped';
	}

	const ctx: Ctx = { user: person, community: home, membership: seat, now: clock.now };
	// Resolved now, as the recipient: a subject gone or hidden since is not mailed.
	const target = notificationTarget(db, ctx, row.subjectType, row.subjectId);
	if (!target) return 'skipped';

	const mail = immediateMail(row.kind, row.params, {
		timeZone: timeZoneFor(person, home),
		locale: localeOf(home.locale)
	});
	if (!mail) return 'skipped';

	await getMailTransport().send({
		...notificationMessage({
			to: person.email,
			mail,
			communityName: home.name,
			locale: localeOf(home.locale),
			url: new URL(targetHref(home.slug, target), appUrl).toString(),
			preferencesUrl: new URL(`${links.notifications(home.slug)}/settings`, appUrl).toString()
		}),
		kind: `notification.${row.kind}`,
		communityId: home.id,
		ref: seat.id
	});
	return 'sent';
}

async function sendRemoval(
	db: Db,
	removal: { membershipId: string; communityName: string },
	appUrl: string
): Promise<MailOutcome> {
	const found = db
		.select({ membership, user, community })
		.from(membership)
		.innerJoin(user, eq(user.id, membership.userId))
		.innerJoin(community, eq(community.id, membership.communityId))
		.where(eq(membership.id, removal.membershipId))
		.get();
	// Email off still means off; a suspended community still says goodbye.
	if (!found || !found.membership.emailEnabled || !reachable(found.user)) return 'skipped';

	await getMailTransport().send({
		...notificationMessage({
			to: found.user.email,
			mail: { kind: 'removal' },
			// As it was called when they were removed.
			communityName: removal.communityName,
			locale: localeOf(found.community.locale),
			url: new URL('/', appUrl).toString(),
			preferencesUrl: null
		}),
		kind: 'notification.removal',
		communityId: found.community.id,
		ref: found.membership.id
	});
	return 'sent';
}

/** What an immediate kind says by email, or null for a kind that waits for the digest. */
function immediateMail(
	kind: string,
	params: Record<string, unknown> | null,
	reader: { timeZone: string; locale: string }
): ImmediateMail | null {
	switch (kind) {
		case 'consent.opened':
			return { kind };
		case 'consent.closing': {
			const closesAt = Number(params?.closesAt);
			if (!Number.isFinite(closesAt)) return null;
			return { kind, when: formatMoment(closesAt, reader, 'deadline') };
		}
		case 'membership.role_changed':
			// Checking the stored value is a known one, not deciding what anyone may do.
			return ROLES.has(params?.role as never)
				? { kind, role: params!.role as 'steward' | 'member' }
				: null;
		case 'claim.withdrawn':
			return { kind };
		default:
			return null;
	}
}

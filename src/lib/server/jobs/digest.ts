import { and, count, eq, gte, isNull } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { decision } from '../db/schema/decisions.js';
import { discussion } from '../db/schema/discussions.js';
import { notification } from '../db/schema/notifications.js';
import { community, membership } from '../db/schema/tenancy.js';
import { getMailTransport } from '../mail/index.js';
import type { Message } from '../mail/transport.js';
import { links } from '../../links.js';
import type { NotificationKind } from '../../notifications/kinds.js';
import { wallClockIn } from '../../time/format.js';
import { timeZoneFor } from '../../time/zone.js';

/**
 * The weekly digest, one member at a time. UI spec §4.11, docs/04-security.md §4,
 * `openspec/changes/notifications-page`.
 *
 * Runs hourly, because "Monday morning" arrives at a different hour for every
 * member: each is due once it is past 07:00 on their chosen day in their own
 * time zone, if their email is on and their last digest was more than six days
 * ago. Each due member is stamped before their message is attempted — including
 * a member with nothing to report — so the rest of their day's hourly runs pass
 * them by, and a failing address costs one attempt a week rather than seventeen.
 *
 * What it may say is the whole design: **counts and a link, never content.** An
 * inbox is outside every visibility control the application has — forwarded,
 * synced to phones, read by mail providers, kept long after someone leaves — so
 * a digest quoting a definition has published that definition to an audience
 * nobody consented to. It carries how many things happened and where to look.
 */

export const DIGEST_INTERVAL_MS = 60 * 60_000;
export const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60_000;
/** Six days rather than seven, so a digest an hour late one week is not skipped the next. */
const DIGEST_GAP_MS = 6 * 24 * 60 * 60_000;
const DIGEST_HOUR = 7;

export type DigestCounts = { decisions: number; discussions: number };
export type UnreadCounts = Partial<Record<NotificationKind, number>>;

export function countActivity(db: Db, communityId: string, since: number): DigestCounts {
	const [decisions] = db
		.select({ n: count() })
		.from(decision)
		.where(and(eq(decision.communityId, communityId), gte(decision.decidedAt, new Date(since))))
		.all();

	const [discussions] = db
		.select({ n: count() })
		.from(discussion)
		.where(
			and(eq(discussion.communityId, communityId), gte(discussion.lastActivityAt, new Date(since)))
		)
		.all();

	return { decisions: decisions?.n ?? 0, discussions: discussions?.n ?? 0 };
}

/** A member's unread notifications here, counted by kind. */
export function countUnread(db: Db, membershipId: string): UnreadCounts {
	return Object.fromEntries(
		db
			.select({ kind: notification.kind, n: count() })
			.from(notification)
			.where(and(eq(notification.recipientMembershipId, membershipId), isNull(notification.readAt)))
			.groupBy(notification.kind)
			.all()
			.map((row) => [row.kind, row.n])
	);
}

/** How the digest names each kind of unread notification, singular and plural. */
const KIND_WORDS: Record<NotificationKind, [string, string]> = {
	'discussion.reply': ['thread with new replies', 'threads with new replies'],
	'discussion.mention': ['mention', 'mentions'],
	'proposal.posted': ['new proposal', 'new proposals'],
	'consent.opened': ['consent round opened', 'consent rounds opened'],
	'consent.closing': ['consent round closing soon', 'consent rounds closing soon'],
	'decision.frozen': ['decision recorded', 'decisions recorded'],
	'definition.review_due': ['definition due for review', 'definitions due for review'],
	'discussion.quiet': ['quiet thread', 'quiet threads'],
	'document.scan_ended': ['document scan finished', 'document scans finished'],
	'export.ready': ['export ready', 'exports ready'],
	'membership.role_changed': ['role change', 'role changes'],
	'claim.withdrawn': ['compliance claim withdrawn', 'compliance claims withdrawn']
};

/**
 * The body. Written here and nowhere else, so the no-content rule is one
 * function to read rather than a promise spread across call sites.
 */
export function digestMessage(input: {
	to: string;
	communityName: string;
	counts: DigestCounts;
	unread: UnreadCounts;
	url: string;
	preferencesUrl: string;
}): Message {
	const { counts, unread, communityName } = input;
	const waiting = (Object.entries(unread) as [NotificationKind, number][])
		.filter(([, n]) => n > 0)
		.map(([kind, n]) => `  ${n} ${KIND_WORDS[kind]?.[n === 1 ? 0 : 1] ?? kind}`);

	const lines = [
		`This week in ${communityName}:`,
		'',
		`  ${counts.decisions} ${counts.decisions === 1 ? 'decision was' : 'decisions were'} recorded`,
		`  ${counts.discussions} ${counts.discussions === 1 ? 'discussion' : 'discussions'} had activity`,
		...(waiting.length > 0 ? ['', 'Waiting for you:', ...waiting] : []),
		'',
		'What was decided, and what people said, is in the app.'
	];

	return {
		to: input.to,
		subject: `This week in ${communityName}`,
		text: [
			...lines,
			'',
			input.url,
			'',
			`Choose which emails you get from ${communityName}:`,
			input.preferencesUrl,
			'',
			'— RCOS Compass'
		].join('\n'),
		url: input.url
	};
}

export type DigestResult = { due: number; sent: number; quiet: number; failed: number };

/** Send each member whose digest is due theirs. See the module comment for "due". */
export async function sendDigests(db: Db, clock: Clock, appUrl: string): Promise<DigestResult> {
	const now = clock.now();
	const transport = getMailTransport();
	const result: DigestResult = { due: 0, sent: 0, quiet: 0, failed: 0 };

	for (const home of db.select().from(community).where(eq(community.status, 'active')).all()) {
		const seats = db
			.select({ membership, user })
			.from(membership)
			.innerJoin(user, eq(user.id, membership.userId))
			.where(
				and(
					eq(membership.communityId, home.id),
					isNull(membership.endedAt),
					eq(membership.emailEnabled, true)
				)
			)
			.all();

		for (const { membership: seat, user: person } of seats) {
			if (person.erasedAt || !person.emailVerified) continue;
			if (seat.lastDigestAt && now - seat.lastDigestAt.getTime() <= DIGEST_GAP_MS) continue;
			const local = wallClockIn(now, timeZoneFor(person, home));
			if (local.weekday !== seat.digestDay || local.hour < DIGEST_HOUR) continue;

			result.due += 1;
			db.update(membership)
				.set({ lastDigestAt: new Date(now) })
				.where(eq(membership.id, seat.id))
				.run();

			const since = Math.max(seat.lastDigestAt?.getTime() ?? 0, now - DIGEST_WINDOW_MS);
			const counts = countActivity(db, home.id, since);
			const unread = countUnread(db, seat.id);
			// A quiet week sends nothing. A digest saying "0 decisions, 0 discussions"
			// is how people learn to filter the sender.
			if (counts.decisions === 0 && counts.discussions === 0 && Object.keys(unread).length === 0) {
				result.quiet += 1;
				continue;
			}

			try {
				await transport.send({
					...digestMessage({
						to: person.email,
						communityName: home.name,
						counts,
						unread,
						url: new URL(links.dashboard(home.slug), appUrl).toString(),
						preferencesUrl: new URL(links.notificationSettings(home.slug), appUrl).toString()
					}),
					kind: 'digest',
					communityId: home.id,
					ref: seat.id
				});
				result.sent += 1;
			} catch {
				// One unreachable address must not cost everyone else their digest.
				result.failed += 1;
			}
		}
	}

	return result;
}

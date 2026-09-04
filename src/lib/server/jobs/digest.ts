import { and, count, eq, gte, isNull } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { decision } from '../db/schema/decisions.js';
import { discussion } from '../db/schema/discussions.js';
import { community, membership } from '../db/schema/tenancy.js';
import { getMailTransport } from '../mail/index.js';
import type { Message } from '../mail/transport.js';

/**
 * The weekly digest. UI spec §4.11, docs/04-security.md §4.
 *
 * A job rather than a request, because it sends mail to every member of every
 * community and nothing that slow belongs anywhere near a write lock.
 *
 * What it may say is the whole design: **counts and a link, never content.** An
 * inbox is outside every visibility control the application has — forwarded,
 * synced to phones, read by mail providers, kept long after someone leaves — so
 * a digest quoting a definition has published that definition to an audience
 * nobody consented to. It carries how many things happened and where to look.
 */

export const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60_000;

export type DigestCounts = { decisions: number; discussions: number };

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

/**
 * The body. Written here and nowhere else, so the no-content rule is one
 * function to read rather than a promise spread across call sites.
 */
export function digestMessage(
	to: string,
	communityName: string,
	counts: DigestCounts,
	url: string
): Message {
	const lines = [
		`This week in ${communityName}:`,
		'',
		`  ${counts.decisions} ${counts.decisions === 1 ? 'decision was' : 'decisions were'} recorded`,
		`  ${counts.discussions} ${counts.discussions === 1 ? 'discussion' : 'discussions'} had activity`,
		'',
		'What was decided, and what people said, is in the app.'
	];

	return {
		to,
		subject: `This week in ${communityName}`,
		text: [...lines, '', url, '', '— RCOS Compass'].join('\n'),
		url
	};
}

/**
 * Send one digest per member of every community with something to report.
 *
 * Idempotent in the only sense that matters for at-least-once delivery: it reads
 * activity in a window and sends; running it twice sends twice, which is why it
 * is scheduled weekly rather than retried aggressively. A failed send is logged
 * by the caller and does not stop the rest — one bad address must not cost a
 * hundred people their digest.
 */
export async function sendWeeklyDigests(
	db: Db,
	clock: Clock,
	appUrl: string
): Promise<{ communities: number; sent: number; failed: number }> {
	const since = clock.now() - DIGEST_WINDOW_MS;
	const transport = getMailTransport();

	let communities = 0;
	let sent = 0;
	let failed = 0;

	for (const tenant of db.select().from(community).where(eq(community.status, 'active')).all()) {
		const counts = countActivity(db, tenant.id, since);
		// A quiet week sends nothing. A digest saying "0 decisions, 0 discussions"
		// is how people learn to filter the sender.
		if (counts.decisions === 0 && counts.discussions === 0) continue;

		communities += 1;

		const recipients = db
			.select({ email: user.email })
			.from(membership)
			.innerJoin(user, eq(user.id, membership.userId))
			.where(and(eq(membership.communityId, tenant.id), isNull(membership.endedAt)))
			.all();

		const url = new URL(`/c/${tenant.slug}`, appUrl).toString();

		for (const recipient of recipients) {
			try {
				await transport.send(digestMessage(recipient.email, tenant.name, counts, url));
				sent += 1;
			} catch {
				// One unreachable address must not cost everyone else their digest.
				failed += 1;
			}
		}
	}

	return { communities, sent, failed };
}

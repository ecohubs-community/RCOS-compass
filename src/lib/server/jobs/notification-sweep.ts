import { and, eq, gt, gte, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { definition, definitionVersion } from '../db/schema/definitions.js';
import {
	consentEligible,
	consentResponse,
	consentRound,
	discussion,
	post
} from '../db/schema/discussions.js';
import { notification } from '../db/schema/notifications.js';
import { community, membership, type Community } from '../db/schema/tenancy.js';
import { notify, type NotifyScope } from '../services/notifications.js';
import { definitionTitle } from '../services/search.js';
import { runClaimCheck } from './claim-check.js';

/**
 * The notifications nobody's act causes: something is about to close, has gone
 * quiet, or has come due. `openspec/changes/notifications-page`, UI spec §4.11.
 *
 * Hourly, re-arming itself like the other housekeeping jobs. Every rule checks
 * what it has already written before writing, so a rerun — at-least-once
 * delivery, or two runs an hour apart — tells nobody twice. Suspended
 * communities are skipped: nothing there can be acted on.
 */

export const SWEEP_INTERVAL_MS = 60 * 60_000;
/** A round closing within this is worth a reminder to whoever has not answered. */
export const CLOSING_WINDOW_MS = 48 * 60 * 60_000;
/** A thread with nothing new for this long is one its opener may want to close or nudge. */
export const QUIET_AFTER_MS = 14 * 24 * 60 * 60_000;

export type SweepResult = { closing: number; quiet: number; reviews: number; claims: number };

export async function runNotificationSweep(db: Db, clock: Clock): Promise<SweepResult> {
	const result: SweepResult = { closing: 0, quiet: 0, reviews: 0, claims: 0 };
	for (const home of db.select().from(community).where(eq(community.status, 'active')).all()) {
		// The database calls are synchronous, and this job runs in the web server's
		// process: a thousand communities in one unbroken loop answered no request
		// until the last claim was checked. One community, then a turn for everyone
		// else.
		await new Promise((resolve) => setImmediate(resolve));
		// Nobody's act, so nobody is left out as its actor.
		const scope: NotifyScope = { community: home, membership: null, now: clock.now };
		result.closing += remindClosingRounds(db, scope, clock.now());
		result.quiet += tellQuietThreads(db, scope, clock.now());
		result.reviews += tellReviewsDue(db, scope, home, clock.now());
		// Here rather than as a job per community: the sweep is already a job, and
		// one queued check for every community in an instance is a queue that
		// makes a member's upload wait behind hundreds of them.
		runClaimCheck(db, clock, { communityId: home.id });
		result.claims += 1;
	}
	return result;
}

/** Open rounds closing within two days: the eligible who have not responded, once per round. */
function remindClosingRounds(db: Db, scope: NotifyScope, now: number): number {
	const rounds = db
		.select({ round: consentRound, discussionId: discussion.id, title: discussion.title })
		.from(consentRound)
		.innerJoin(post, eq(post.id, consentRound.proposalPostId))
		.innerJoin(discussion, eq(discussion.id, post.discussionId))
		.where(
			and(
				eq(consentRound.communityId, scope.community.id),
				eq(consentRound.status, 'open'),
				isNotNull(consentRound.closesAt),
				gt(consentRound.closesAt, new Date(now)),
				lte(consentRound.closesAt, new Date(now + CLOSING_WINDOW_MS))
			)
		)
		.all();

	let told = 0;
	for (const { round, discussionId, title } of rounds) {
		const eligible = db
			.select({ id: consentEligible.membershipId })
			.from(consentEligible)
			.where(eq(consentEligible.roundId, round.id))
			.all()
			.map((row) => row.id);
		const answered = new Set(
			db
				.select({ id: consentResponse.membershipId })
				.from(consentResponse)
				.where(eq(consentResponse.roundId, round.id))
				.all()
				.map((row) => row.id)
		);
		const reminded = alreadyTold(
			db,
			scope,
			'consent.closing',
			sql`json_extract(${notification.params}, '$.roundId') = ${round.id}`
		);
		const closesAt = round.closesAt!.getTime();
		told += notify(db, scope, {
			kind: 'consent.closing',
			subjectType: 'discussion',
			subjectId: discussionId,
			summary: `A consent round closes soon: ${title}`,
			params: { title, closesAt, roundId: round.id },
			recipients: eligible.filter((id) => !answered.has(id) && !reminded.has(id)),
			mail: true
		});
	}
	return told;
}

/** Open threads quiet for two weeks: their opener, once for each quiet spell. */
function tellQuietThreads(db: Db, scope: NotifyScope, now: number): number {
	const threads = db
		.select({
			id: discussion.id,
			title: discussion.title,
			lastActivityAt: discussion.lastActivityAt,
			opener: membership.id
		})
		.from(discussion)
		.innerJoin(
			membership,
			and(
				eq(membership.userId, discussion.openedBy),
				eq(membership.communityId, discussion.communityId)
			)
		)
		.where(
			and(
				eq(discussion.communityId, scope.community.id),
				eq(discussion.status, 'open'),
				lte(discussion.lastActivityAt, new Date(now - QUIET_AFTER_MS))
			)
		)
		.all();

	let told = 0;
	for (const thread of threads) {
		// A notification written after the thread last moved belongs to this spell.
		const spell = alreadyTold(
			db,
			scope,
			'discussion.quiet',
			and(eq(notification.subjectId, thread.id), gte(notification.createdAt, thread.lastActivityAt))
		);
		if (spell.size > 0) continue;
		told += notify(db, scope, {
			kind: 'discussion.quiet',
			subjectType: 'discussion',
			subjectId: thread.id,
			summary: `Quiet for two weeks: ${thread.title}`,
			params: { title: thread.title },
			recipients: [thread.opener]
		});
	}
	return told;
}

/**
 * Adopted definitions past their review date: the author of the adopted version,
 * or whoever created the definition when that author is gone — once per date.
 */
function tellReviewsDue(db: Db, scope: NotifyScope, home: Community, now: number): number {
	const due = db
		.select({ definition, authorId: definitionVersion.authorId })
		.from(definition)
		.innerJoin(definitionVersion, eq(definitionVersion.id, definition.adoptedVersionId))
		.where(
			and(
				eq(definition.communityId, scope.community.id),
				isNotNull(definition.reviewDueAt),
				lte(definition.reviewDueAt, new Date(now))
			)
		)
		.all();

	let told = 0;
	for (const { definition: row, authorId } of due) {
		const already = alreadyTold(
			db,
			scope,
			'definition.review_due',
			and(eq(notification.subjectId, row.id), gte(notification.createdAt, row.reviewDueAt!))
		);
		if (already.size > 0) continue;

		const recipient =
			currentMembershipOf(db, home.id, authorId) ?? currentMembershipOf(db, home.id, row.createdBy);
		if (!recipient) continue;
		const title = definitionTitle(db, home.id, row);
		told += notify(db, scope, {
			kind: 'definition.review_due',
			subjectType: 'definition',
			subjectId: row.id,
			summary: `Due for review: ${title}`,
			params: { title },
			recipients: [recipient]
		});
	}
	return told;
}

/** The recipients already written a notification of this kind matching `where`. */
function alreadyTold(
	db: Db,
	scope: NotifyScope,
	kind: string,
	where: SQL | undefined
): Set<string> {
	return new Set(
		db
			.select({ id: notification.recipientMembershipId })
			.from(notification)
			.where(
				and(eq(notification.communityId, scope.community.id), eq(notification.kind, kind), where)
			)
			.all()
			.map((row) => row.id)
	);
}

function currentMembershipOf(db: Db, communityId: string, userId: string | null): string | null {
	if (!userId) return null;
	return (
		db
			.select({ id: membership.id })
			.from(membership)
			.where(
				and(
					eq(membership.communityId, communityId),
					eq(membership.userId, userId),
					isNull(membership.endedAt)
				)
			)
			.get()?.id ?? null
	);
}

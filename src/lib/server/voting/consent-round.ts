import { and, count, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import {
	consentEligible,
	consentResponse,
	consentRound,
	discussion,
	post
} from '../db/schema/discussions.js';
import { membership } from '../db/schema/tenancy.js';
import { countUnresolved, raiseObjection } from '../services/objections.js';
import { notify } from '../services/notifications.js';
import type { OpenRoundInput, ResponseValue, Round, Tally, VotingProvider } from './provider.js';

/**
 * The built-in consent round. UI spec §5.1.
 *
 * Each member responds once — consent, objection, or abstain — and the round
 * closes at its deadline or when the last eligible person has answered. What
 * comes out is a tally that pre-fills the freeze. **Nothing else.** No decision,
 * no version, no change-log entry: a person still has to press Freeze, with
 * their name on it.
 */

function roundInCommunity(db: Db, ctx: Ctx, roundId: string) {
	const found = db
		.select({ round: consentRound })
		.from(consentRound)
		.where(and(eq(consentRound.id, roundId), eq(consentRound.communityId, ctx.community.id)))
		.get();
	if (!found) error(404, 'Not found');
	return found.round;
}

function toRound(row: typeof consentRound.$inferSelect, eligible: number): Round {
	return {
		id: row.id,
		proposalPostId: row.proposalPostId,
		openedAt: row.openedAt.getTime(),
		closesAt: row.closesAt.getTime(),
		status: row.status,
		closedAt: row.closedAt?.getTime() ?? null,
		eligible
	};
}

function countEligible(db: Db, roundId: string): number {
	const [row] = db
		.select({ n: count() })
		.from(consentEligible)
		.where(eq(consentEligible.roundId, roundId))
		.all();
	return row?.n ?? 0;
}

/**
 * Close the round if its time has come.
 *
 * Two ways: the deadline passes, or everyone entitled to answer has. The second
 * matters — a community of nine should not wait three days for a deadline once
 * the ninth person has responded.
 *
 * Called on read as well as on write, so a round is never left open past its
 * deadline just because nobody happened to touch it. A job could sweep too; this
 * makes the sweep an optimisation rather than the mechanism.
 */
function closeIfDue(db: Db, roundId: string, now: number): void {
	const row = db.select().from(consentRound).where(eq(consentRound.id, roundId)).get();
	if (!row || row.status !== 'open') return;

	const eligible = countEligible(db, roundId);
	const [responded] = db
		.select({ n: count() })
		.from(consentResponse)
		.where(eq(consentResponse.roundId, roundId))
		.all();

	const everyoneAnswered = eligible > 0 && (responded?.n ?? 0) >= eligible;
	const deadlinePassed = now >= row.closesAt.getTime();
	if (!everyoneAnswered && !deadlinePassed) return;

	db.update(consentRound)
		.set({ status: 'closed', closedAt: new Date(now) })
		.where(eq(consentRound.id, roundId))
		.run();
}

export const consentRoundProvider: VotingProvider = {
	id: 'consent-round',

	openRound(ctx: Ctx, input: OpenRoundInput, options: { db?: Db } = {}): Round {
		requirePermission(ctx, 'consent.open');
		requireWritableCommunity(ctx);
		const db = options.db ?? getDb();
		const now = ctx.now();

		if (input.closesAt <= now) error(400, 'A round has to close in the future.');

		// The proposal must be this community's.
		const proposal = db
			.select({ post })
			.from(post)
			.innerJoin(discussion, eq(discussion.id, post.discussionId))
			.where(and(eq(post.id, input.proposalPostId), eq(discussion.communityId, ctx.community.id)))
			.get();
		if (!proposal || proposal.post.kind !== 'proposal') error(404, 'Not found');

		const alreadyOpen = db
			.select()
			.from(consentRound)
			.where(
				and(eq(consentRound.proposalPostId, input.proposalPostId), eq(consentRound.status, 'open'))
			)
			.get();
		if (alreadyOpen) error(409, 'A round is already open on this proposal.');

		const roundId = newId();

		return db.transaction((tx) => {
			tx.insert(consentRound)
				.values({
					id: roundId,
					communityId: ctx.community.id,
					proposalPostId: input.proposalPostId,
					openedBy: ctx.user.id,
					openedAt: new Date(now),
					closesAt: new Date(input.closesAt),
					status: 'open',
					closedAt: null,
					eligibility: input.membershipIds ? 'selected' : 'all_members'
				})
				.run();

			/**
			 * Who may respond, captured now.
			 *
			 * A snapshot rather than a live query: someone who joins tomorrow is not
			 * eligible, and "9 of 11 responded" must not change meaning because a
			 * twelfth person arrived. The denominator a community was told about at
			 * the start is the one it is held to at the end.
			 */
			const eligibleIds =
				input.membershipIds ??
				db
					.select({ id: membership.id })
					.from(membership)
					.where(and(eq(membership.communityId, ctx.community.id), isNull(membership.endedAt)))
					.all()
					.map((m) => m.id);

			if (eligibleIds.length === 0) error(409, 'There is nobody to ask.');

			for (const membershipId of eligibleIds) {
				tx.insert(consentEligible).values({ roundId, membershipId }).run();
			}

			notify(tx as unknown as Db, ctx, {
				kind: 'consent.opened',
				subjectType: 'discussion',
				subjectId: proposal.post.discussionId,
				summary: 'A consent round is open',
				recipients: eligibleIds
			});

			return toRound(
				tx.select().from(consentRound).where(eq(consentRound.id, roundId)).get()!,
				eligibleIds.length
			);
		});
	},

	respond(
		ctx: Ctx,
		input: { roundId: string; value: ResponseValue; reason?: string },
		options: { db?: Db } = {}
	): Round {
		requirePermission(ctx, 'consent.respond');
		requireWritableCommunity(ctx);
		const db = options.db ?? getDb();
		const now = ctx.now();

		const round = roundInCommunity(db, ctx, input.roundId);
		closeIfDue(db, round.id, now);

		const current = db.select().from(consentRound).where(eq(consentRound.id, round.id)).get()!;
		if (current.status !== 'open') error(409, 'That round has closed.');

		const eligible = db
			.select()
			.from(consentEligible)
			.where(
				and(
					eq(consentEligible.roundId, round.id),
					eq(consentEligible.membershipId, ctx.membership.id)
				)
			)
			.get();
		// Not eligible and not a member are the same answer: neither gets to learn
		// anything about a round they are not part of.
		if (!eligible) error(404, 'Not found');

		return db.transaction((tx) => {
			let objectionId: string | null = null;
			if (input.value === 'objection') {
				const reason = input.reason?.trim();
				if (!reason) error(400, 'An objection needs a reason, so it can be addressed.');
				objectionId = raiseObjection(
					ctx,
					{ proposalPostId: current.proposalPostId, reason },
					{ db: tx as unknown as Db }
				).id;
			}

			// Changing your mind replaces your answer; it never adds a second voice.
			tx.insert(consentResponse)
				.values({
					roundId: round.id,
					membershipId: ctx.membership.id,
					value: input.value,
					objectionId,
					respondedAt: new Date(now)
				})
				.onConflictDoUpdate({
					target: [consentResponse.roundId, consentResponse.membershipId],
					set: { value: input.value, objectionId, respondedAt: new Date(now) }
				})
				.run();

			closeIfDue(tx as unknown as Db, round.id, now);

			return toRound(
				tx.select().from(consentRound).where(eq(consentRound.id, round.id)).get()!,
				countEligible(tx as unknown as Db, round.id)
			);
		});
	},

	tally(ctx: Ctx, roundId: string, options: { db?: Db } = {}): Tally {
		requirePermission(ctx, 'discussion.read');
		const db = options.db ?? getDb();

		const round = roundInCommunity(db, ctx, roundId);
		closeIfDue(db, round.id, ctx.now());
		const current = db.select().from(consentRound).where(eq(consentRound.id, round.id)).get()!;

		const responses = db
			.select()
			.from(consentResponse)
			.where(eq(consentResponse.roundId, round.id))
			.all();

		const of = (value: ResponseValue) => responses.filter((r) => r.value === value).length;

		return {
			mechanism: 'consent',
			threshold: null,
			eligible: countEligible(db, round.id),
			responded: responses.length,
			consent: of('consent'),
			objection: of('objection'),
			abstain: of('abstain'),
			unresolvedObjections: countUnresolved(db, current.proposalPostId),
			closedAt: current.closedAt?.getTime() ?? null
		};
	}
};

/** Which round, if any, is open on a proposal. */
export function openRoundFor(
	db: Db,
	proposalPostId: string
): typeof consentRound.$inferSelect | undefined {
	return db
		.select()
		.from(consentRound)
		.where(and(eq(consentRound.proposalPostId, proposalPostId), eq(consentRound.status, 'open')))
		.get();
}

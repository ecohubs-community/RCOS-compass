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
	objection,
	post
} from '../db/schema/discussions.js';
import { membership } from '../db/schema/tenancy.js';
import { user } from '../db/schema/auth.js';
import { initialsOf, personLabel } from '../services/person.js';
import { countUnresolved, raiseObjection } from '../services/objections.js';
import { writeThreadPost } from '../services/discussions.js';
import { notify } from '../services/notifications.js';
import { registerTenantService } from '../services/registry.js';
import { RESPONSE_VALUES } from './provider.js';
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

/**
 * The proposal, if it belongs to this community and is the version being asked
 * about.
 *
 * A version the community has moved past takes no more responses: a vote
 * arriving on v3 after the question moved would be counted into a tally that a
 * freeze of v3 might later quote.
 *
 * Read from `discussion.current_proposal_post_id` and **not** from whichever
 * version is highest-numbered. Those were the same thing until the question
 * became something a steward can move: a community that has put v3 back on the
 * table is being asked about v3, and refusing an answer to it because v4 exists
 * is refusing the answer to the question that was actually put.
 */
function respondableProposal(db: Db, ctx: Ctx, proposalPostId: string) {
	const found = db
		.select({ post, currentProposalPostId: discussion.currentProposalPostId })
		.from(post)
		.innerJoin(discussion, eq(discussion.id, post.discussionId))
		.where(and(eq(post.id, proposalPostId), eq(discussion.communityId, ctx.community.id)))
		.get();
	if (!found || found.post.kind !== 'proposal') error(404, 'Not found');

	if (found.currentProposalPostId !== found.post.id) {
		error(409, 'This is not the version on the table. Respond to that one.');
	}
	return found.post;
}

/**
 * Open a round, with no view about who is allowed to.
 *
 * Shared by the deliberate act and by the first response that finds no round,
 * which is why the permission check lives in the callers: opening decides
 * nothing — the spec is explicit that a round informs a freeze and never
 * performs one — so a member's first response may cause one, and `openedBy`
 * stays null to say that nobody opened it.
 */
function createRound(
	tx: Db,
	ctx: Ctx,
	input: {
		proposalPostId: string;
		discussionId: string;
		closesAt: number | null;
		membershipIds?: string[];
		openedBy: string | null;
	}
): string {
	const roundId = newId();
	const now = ctx.now();

	tx.insert(consentRound)
		.values({
			id: roundId,
			communityId: ctx.community.id,
			proposalPostId: input.proposalPostId,
			openedBy: input.openedBy,
			openedAt: new Date(now),
			closesAt: input.closesAt === null ? null : new Date(input.closesAt),
			status: 'open',
			closedAt: null,
			supersededByPostId: null,
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
	const current = tx
		.select({ id: membership.id })
		.from(membership)
		.where(and(eq(membership.communityId, ctx.community.id), isNull(membership.endedAt)))
		.all()
		.map((m) => m.id);

	// A named subset is intersected with this community's own memberships
	// rather than trusted. The boundary is not "the only caller passes the
	// right ids" — an id from elsewhere would otherwise become an
	// eligibility row and a notification delivered into another community.
	const eligibleIds = input.membershipIds
		? input.membershipIds.filter((id) => current.includes(id))
		: current;

	if (eligibleIds.length === 0) error(409, 'There is nobody to ask.');

	for (const membershipId of eligibleIds) {
		tx.insert(consentEligible).values({ roundId, membershipId }).run();
	}

	/**
	 * Everyone entitled to answer, told that they can.
	 *
	 * Worded for what is true on both paths. A round now usually opens because
	 * somebody responded, so "a consent round is open" would be a sentence about
	 * bookkeeping; what the recipient needs to know is that there is a proposal
	 * waiting for them. `notify` drops the actor, so the person whose response
	 * opened the round is not told about their own click.
	 */
	notify(tx, ctx, {
		kind: 'consent.opened',
		subjectType: 'discussion',
		subjectId: input.discussionId,
		summary: 'A proposal is open for your response',
		params: {
			title:
				tx
					.select({ title: discussion.title })
					.from(discussion)
					.where(eq(discussion.id, input.discussionId))
					.get()?.title ?? ''
		},
		recipients: eligibleIds,
		mail: true
	});

	return roundId;
}

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
		closesAt: row.closesAt?.getTime() ?? null,
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
 * Close the round if its deadline has passed.
 *
 * **Only the deadline.** It used to close as soon as the last eligible member
 * answered, so that a community of nine would not wait three days for a
 * deadline once the ninth had responded — and that reasoning was about *not
 * waiting*, which nothing here ever did: a round informs a freeze and a person
 * still presses Freeze, so the tally is available the moment it is complete
 * whether the round is open or shut.
 *
 * What it cost was the thing the round is for. `respond` refuses a closed
 * round, so the last member to answer silently took everybody's right to change
 * their mind away with them — and the member who noticed was looking at the
 * answer they had given, unable to move it. Changing your mind is spec'd
 * behaviour; a round that locks on its own is not.
 *
 * Called on read as well as on write, so a round is never left open past its
 * deadline just because nobody happened to touch it. A job could sweep too; this
 * makes the sweep an optimisation rather than the mechanism.
 */
function closeIfDue(db: Db, roundId: string, now: number): void {
	const row = db.select().from(consentRound).where(eq(consentRound.id, roundId)).get();
	if (!row || row.status !== 'open') return;

	// A round with no deadline has none to pass. It ends when the text it is
	// about is replaced, or at the freeze — and not before.
	const deadlinePassed = row.closesAt !== null && now >= row.closesAt.getTime();
	if (!deadlinePassed) return;

	db.update(consentRound)
		.set({ status: 'closed', closedAt: new Date(now) })
		.where(eq(consentRound.id, roundId))
		.run();
}

export const consentRoundProvider: VotingProvider = {
	id: 'consent-round',

	/**
	 * Open a round deliberately, with a deadline somebody chose.
	 *
	 * No longer how a round usually begins — the first response opens one. This
	 * stays because choosing a deadline *is* a governance act, because the
	 * provider interface is the seam a second provider implements, and because a
	 * permission nothing guards would be a claim about the system that is not
	 * true. It is simply not reachable from the discussion screen.
	 */
	openRound(ctx: Ctx, input: OpenRoundInput, options: { db?: Db } = {}): Round {
		requirePermission(ctx, 'consent.open');
		requireWritableCommunity(ctx);
		const db = options.db ?? getDb();
		const now = ctx.now();

		if (input.closesAt != null && input.closesAt <= now) {
			error(400, 'A round has to close in the future.');
		}

		const proposal = respondableProposal(db, ctx, input.proposalPostId);

		/**
		 * A version holds at most one round, whatever state it is in.
		 *
		 * This looked for an *open* one, so a version whose round had been
		 * superseded or had reached its deadline got a second — and `roundFor`
		 * reads one row per proposal, so every screen would go on showing the
		 * first while answers landed in the second. `respond` had the same hole
		 * and this is the same rule.
		 */
		const existing = db
			.select()
			.from(consentRound)
			.where(eq(consentRound.proposalPostId, input.proposalPostId))
			.get();
		if (existing) {
			error(
				409,
				existing.status === 'open'
					? 'A round is already open on this proposal.'
					: 'This version has already had its round.'
			);
		}

		return db.transaction((tx) => {
			const roundId = createRound(tx as unknown as Db, ctx, {
				proposalPostId: input.proposalPostId,
				discussionId: proposal.discussionId,
				closesAt: input.closesAt ?? null,
				membershipIds: input.membershipIds,
				openedBy: ctx.user.id
			});

			return toRound(
				tx.select().from(consentRound).where(eq(consentRound.id, roundId)).get()!,
				countEligible(tx as unknown as Db, roundId)
			);
		});
	},

	respond(
		ctx: Ctx,
		input: { proposalPostId: string; value: ResponseValue; reason?: string },
		options: { db?: Db } = {}
	): Round {
		requirePermission(ctx, 'consent.respond');
		requireWritableCommunity(ctx);

		// Checked here because the database will not — drizzle's `text({ enum })`
		// is a TypeScript constraint. A value outside these three would be stored,
		// counted in `responded`, counted toward "everyone has answered", and
		// appear in none of the three totals the freeze is pre-filled from.
		if (!RESPONSE_VALUES.includes(input.value)) {
			error(400, 'A response is consent, objection or abstain.');
		}
		const db = options.db ?? getDb();
		const now = ctx.now();

		const proposal = respondableProposal(db, ctx, input.proposalPostId);
		const reason = input.reason?.trim() || null;
		if (input.value === 'objection' && !reason) {
			error(400, 'An objection needs a reason, so it can be addressed.');
		}

		return db.transaction((tx) => {
			const inTx = tx as unknown as Db;

			/**
			 * The round, opened here if this is the first answer.
			 *
			 * One transaction with the response it carries: a round with an
			 * eligibility snapshot and nobody in it would claim a denominator the
			 * community was never actually asked against.
			 *
			 * **A version has at most one round, ever.** This used to look only for
			 * an *open* one and open a second when it found none — which was
			 * unreachable while a replaced version refused responses outright, and
			 * became reachable the moment a steward could put such a version back
			 * on the table. What it produced was silent and ugly: `roundFor` reads
			 * one row per proposal, so every screen went on showing the first
			 * round while every new answer landed in the second. A member saw the
			 * answer they gave first, could not change it, and could object as
			 * often as they liked with nothing on screen moving.
			 */
			const existing = tx
				.select()
				.from(consentRound)
				.where(eq(consentRound.proposalPostId, input.proposalPostId))
				.get();
			if (existing && existing.status !== 'open') {
				error(409, 'That round has closed, so this version takes no more responses.');
			}
			let current = existing;

			if (!current) {
				const roundId = createRound(inTx, ctx, {
					proposalPostId: input.proposalPostId,
					discussionId: proposal.discussionId,
					// Nobody chose a deadline, so the round does not have one.
					closesAt: null,
					openedBy: null
				});
				current = tx.select().from(consentRound).where(eq(consentRound.id, roundId)).get()!;
			} else {
				closeIfDue(inTx, current.id, now);
				current = tx.select().from(consentRound).where(eq(consentRound.id, current.id)).get()!;
				if (current.status !== 'open') error(409, 'That round has closed.');
			}

			const eligible = tx
				.select()
				.from(consentEligible)
				.where(
					and(
						eq(consentEligible.roundId, current.id),
						eq(consentEligible.membershipId, ctx.membership.id)
					)
				)
				.get();
			// Not eligible and not a member are the same answer: neither gets to learn
			// anything about a round they are not part of.
			if (!eligible) error(404, 'Not found');

			/**
			 * Whatever this person said last time, withdrawn.
			 *
			 * An objection is never deleted (`services/objections.ts`), but it must
			 * stop counting when the person who raised it stops making it —
			 * otherwise changing your mind to consent leaves the round reporting no
			 * objections while the freeze permanently records "1 unresolved
			 * objection", and objecting twice leaves two.
			 *
			 * The post carrying their earlier reason is left exactly where it is. It
			 * is a thing they said, in a conversation other people answered.
			 */
			const previous = tx
				.select()
				.from(consentResponse)
				.where(
					and(
						eq(consentResponse.roundId, current.id),
						eq(consentResponse.membershipId, ctx.membership.id)
					)
				)
				.get();

			if (previous?.objectionId) {
				tx.update(objection)
					.set({
						state: 'withdrawn',
						resolvedBy: ctx.user.id,
						resolvedAt: new Date(now),
						resolutionNote: 'Withdrawn: the response to the round changed.'
					})
					.where(and(eq(objection.id, previous.objectionId), eq(objection.state, 'open')))
					.run();
			}

			/**
			 * The reason, in the thread.
			 *
			 * Consent and abstain carry one as readily as an objection does, and "I
			 * agree, but only because of X" is the most useful sentence a quiet member
			 * says. It is written as an ordinary message so that every surface that
			 * renders the conversation renders it too.
			 */
			const reasonPostId = reason
				? writeThreadPost(ctx, inTx, {
						discussionId: proposal.discussionId,
						body: reason,
						kind: 'response',
						responseValue: input.value,
						subjectPostId: current.proposalPostId
					}).id
				: null;

			let objectionId: string | null = null;
			if (input.value === 'objection') {
				objectionId = raiseObjection(
					ctx,
					{ proposalPostId: current.proposalPostId, reason: reason!, postId: reasonPostId },
					{ db: inTx }
				).id;
			}

			// Changing your mind replaces your answer; it never adds a second voice.
			tx.insert(consentResponse)
				.values({
					roundId: current.id,
					membershipId: ctx.membership.id,
					value: input.value,
					objectionId,
					reasonPostId,
					respondedAt: new Date(now)
				})
				.onConflictDoUpdate({
					target: [consentResponse.roundId, consentResponse.membershipId],
					set: { value: input.value, objectionId, reasonPostId, respondedAt: new Date(now) }
				})
				.run();

			closeIfDue(inTx, current.id, now);

			return toRound(
				tx.select().from(consentRound).where(eq(consentRound.id, current.id)).get()!,
				countEligible(inTx, current.id)
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

/**
 * A round is addressed by id like anything else, and the registry is the reason
 * the cross-tenant suite covers it. The provider seam does not exempt it: a
 * VoteCast provider slotted in post-MVP registers its own, or it is not covered.
 */
registerTenantService({
	name: 'consent.tally',
	subject: 'consentRound',
	call: (ctx, subjectId) => consentRoundProvider.tally(ctx, subjectId)
});
registerTenantService({
	name: 'consent.respond',
	subject: 'proposal',
	call: (ctx, subjectId) =>
		consentRoundProvider.respond(ctx, { proposalPostId: subjectId, value: 'consent' })
});

export type LabelledResponse = {
	value: ResponseValue;
	/** So the freeze can pre-fill attendance from the people who answered. */
	membershipId: string;
	who: string;
	initials: string;
	reason: string | null;
	respondedAt: number;
};

/**
 * Every response to one version, with a name against each.
 *
 * What the vote block lists when it is expanded. Names go through `personLabel`
 * like everywhere else (`docs/03` §10) — somebody who has been erased is still
 * counted and still listed, under their community's former-member label, because
 * removing their vote would change a tally the community was given.
 */
export function listResponses(
	ctx: Ctx,
	roundId: string,
	options: { db?: Db } = {}
): LabelledResponse[] {
	requirePermission(ctx, 'discussion.read');
	const db = options.db ?? getDb();
	const round = roundInCommunity(db, ctx, roundId);

	return db
		.select({
			value: consentResponse.value,
			membershipId: consentResponse.membershipId,
			respondedAt: consentResponse.respondedAt,
			reason: post.body,
			name: user.name,
			erasedAt: user.erasedAt,
			displayName: membership.displayName,
			seq: membership.seq
		})
		.from(consentResponse)
		.innerJoin(membership, eq(membership.id, consentResponse.membershipId))
		.leftJoin(user, eq(user.id, membership.userId))
		.leftJoin(post, eq(post.id, consentResponse.reasonPostId))
		.where(eq(consentResponse.roundId, round.id))
		.orderBy(consentResponse.respondedAt)
		.all()
		.map((row) => {
			const who = personLabel({
				erasedAt: row.erasedAt ?? null,
				name: row.name,
				displayName: row.displayName,
				seq: row.seq
			});
			return {
				value: row.value,
				membershipId: row.membershipId,
				who,
				initials: initialsOf(who),
				reason: row.reason,
				respondedAt: row.respondedAt.getTime()
			};
		});
}

/** The round on a proposal whatever its state — the rail reads superseded ones. */
export function roundFor(
	db: Db,
	proposalPostId: string
): typeof consentRound.$inferSelect | undefined {
	return db
		.select()
		.from(consentRound)
		.where(eq(consentRound.proposalPostId, proposalPostId))
		.get();
}

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

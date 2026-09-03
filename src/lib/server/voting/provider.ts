import type { Ctx } from '../auth/guard.js';
import type { Db } from '../db/index.js';

/**
 * How a community reaches agreement, behind one interface.
 *
 * The built-in consent round is the default provider; VoteCast becomes a second
 * one post-MVP (UI spec §5.2). The seam is cheap now and expensive later, and it
 * only works if one rule holds:
 *
 * **The freeze consumes a {@link Tally}, never a round.** Nothing on the freeze
 * path may name a provider-specific type, or adding the second provider means
 * touching the one piece of code that must not be touched casually. There is a
 * test asserting exactly that.
 *
 * The second rule is about what a provider may do, not about types: **a round
 * informs a freeze and never performs one.** Closing a round produces a tally
 * and nothing else — no decision, no version, no change-log entry. Freezing
 * stays a human act with a name on it, and a community may ignore a round
 * entirely and decide in a room. Dissent that gets recorded automatically is
 * dissent nobody read.
 */

export type RoundStatus = 'open' | 'closed' | 'cancelled';

export type Round = {
	id: string;
	proposalPostId: string;
	openedAt: number;
	closesAt: number;
	status: RoundStatus;
	closedAt: number | null;
	/** How many people were entitled to respond when it opened. */
	eligible: number;
};

export type ResponseValue = 'consent' | 'objection' | 'abstain';

/**
 * What a freeze is pre-filled from.
 *
 * Deliberately plain numbers and strings: a provider that needed to hand the
 * freeze one of its own objects would be a provider the freeze knows about.
 */
export type Tally = {
	mechanism: string;
	threshold: string | null;
	/** Entitled to respond. The denominator a community was told about. */
	eligible: number;
	/** Actually responded. "9 of 11 responded" is `responded` of `eligible`. */
	responded: number;
	consent: number;
	objection: number;
	abstain: number;
	/** Objections still open on the proposal, which the decision must record. */
	unresolvedObjections: number;
	closedAt: number | null;
};

export type OpenRoundInput = {
	proposalPostId: string;
	closesAt: number;
	/** Absent means every current member. */
	membershipIds?: string[];
};

export interface VotingProvider {
	readonly id: string;
	openRound(ctx: Ctx, input: OpenRoundInput, options?: { db?: Db }): Round;
	respond(
		ctx: Ctx,
		input: { roundId: string; value: ResponseValue; reason?: string },
		options?: { db?: Db }
	): Round;
	tally(ctx: Ctx, roundId: string, options?: { db?: Db }): Tally;
}

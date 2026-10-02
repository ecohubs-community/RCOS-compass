/**
 * A definition's status, derived — never stored (docs/03 §5).
 *
 * Stored, it would have to be kept in step by every event that changes it: a
 * post, a round opening, a freeze, and time passing, which has no event at all.
 * The mockups already show what that produces — one definition "Adopted" on one
 * screen and "In discussion" on the next. So it is one pure function, given the
 * facts by whoever already has them, and every screen calls it.
 *
 *     not_started ─► drafting ─► in_discussion ─► in_vote ─► adopted
 *                                                              │
 *                                       needs_review ◄─────────┘ (review date passed)
 *
 * An adopted definition stays adopted while a change to it is argued: the
 * adopted version is the rule until the next freeze. `rediscussed` says so
 * beside the status rather than replacing it. Provisional is not a status and
 * is not here.
 *
 * The words are `<StatusChip>`'s, so a status computed here is one the chip
 * can draw.
 */

export type DefinitionStatus =
	'not_started' | 'drafting' | 'in_discussion' | 'in_vote' | 'adopted' | 'needs_review';

export type StatusFacts = {
	/** A definition row exists for it (a draft, even an empty one). */
	exists: boolean;
	adopted: boolean;
	/** An open discussion about it. */
	openDiscussion: boolean;
	/** An open consent round on its current proposal. */
	openRound: boolean;
	reviewDueAt: number | null;
};

export type DerivedStatus = { status: DefinitionStatus; rediscussed: boolean };

export function definitionStatus(facts: StatusFacts, now: number): DerivedStatus {
	if (facts.adopted) {
		return {
			status: facts.reviewDueAt !== null && facts.reviewDueAt < now ? 'needs_review' : 'adopted',
			rediscussed: facts.openDiscussion || facts.openRound
		};
	}
	const status: DefinitionStatus = facts.openRound
		? 'in_vote'
		: facts.openDiscussion
			? 'in_discussion'
			: facts.exists
				? 'drafting'
				: 'not_started';
	return { status, rediscussed: false };
}

/**
 * "What it takes to pass": a round's facts beside the community's own interim
 * rule. `openspec/changes/provenance-ui` D8.
 *
 * Pure, and computed from the tally the rail already shows, so the two can
 * never disagree. **It informs; it never gates.** Nothing reads `met` to allow
 * or refuse anything — the freeze form repeats this so a steward freezes
 * knowingly, and the app enforces nobody's threshold (UI spec §5.1).
 */

export type InterimRule = {
	/** A quorum as a fraction of the eligible: 3/4 is `{ num: 3, den: 4 }`. */
	quorum: { num: number; den: number } | null;
	/** How many days a round should stay open. */
	minDays: number | null;
};

export type PassChecklist = {
	/** False when the community has recorded neither part of a rule. */
	ruleRecorded: boolean;
	present: { responded: number; eligible: number; needed: number | null; met: boolean | null };
	/** Consent passes with no objection sustained, rule or no rule. */
	objections: { open: number; met: boolean };
	days: { open: number; needed: number | null; met: boolean | null };
};

const DAY = 24 * 60 * 60 * 1000;

export function passChecklist(input: {
	eligible: number;
	responded: number;
	unresolvedObjections: number;
	openedAt: number;
	now: number;
	rule: InterimRule;
}): PassChecklist {
	const { quorum, minDays } = input.rule;
	// Rounded up: three quarters of 19 is 14.25 people, and 14 is not three quarters.
	const needed = quorum ? Math.ceil((input.eligible * quorum.num) / quorum.den) : null;
	const daysOpen = Math.max(0, Math.floor((input.now - input.openedAt) / DAY));

	return {
		ruleRecorded: quorum !== null || minDays !== null,
		present: {
			responded: input.responded,
			eligible: input.eligible,
			needed,
			met: needed === null ? null : input.responded >= needed
		},
		objections: { open: input.unresolvedObjections, met: input.unresolvedObjections === 0 },
		days: {
			open: daysOpen,
			needed: minDays,
			met: minDays === null ? null : daysOpen >= minDays
		}
	};
}

/** The community's rule from its row, with a half-recorded quorum read as none. */
export function interimRuleOf(community: {
	interimQuorumNum: number | null;
	interimQuorumDen: number | null;
	interimMinDays: number | null;
}): InterimRule {
	const { interimQuorumNum: num, interimQuorumDen: den } = community;
	return {
		quorum: num !== null && den !== null && den > 0 ? { num, den } : null,
		minDays: community.interimMinDays
	};
}

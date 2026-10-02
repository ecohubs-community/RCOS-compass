import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { changeLog } from '../db/schema/decisions.js';
import { community } from '../db/schema/tenancy.js';
import { interimRuleOf, type InterimRule } from '../../shared/pass-checklist.js';

/**
 * The community's interim adoption rule. UI spec §4.9,
 * `openspec/changes/provenance-ui` D8.
 *
 * What a community says it needs before it adopts something, until its own
 * Decision Matrix says so properly: a quorum as a fraction of the eligible, and
 * how many days a round should stay open. Both optional. **Recorded, never
 * enforced** — the round view shows the facts beside it, and nothing anywhere
 * refuses a response, a closing or a freeze because of it.
 */

/** Readable by every member: the rule is what the round view measures against. */
export function interimRule(ctx: Ctx): InterimRule {
	requirePermission(ctx, 'discussion.read');
	return interimRuleOf(ctx.community);
}

/** A sensible upper bound, so a typo of 700 days is a refusal and not a rule. */
const MAX_DAYS = 365;

export function setInterimRule(
	ctx: Ctx,
	input: InterimRule,
	options: { db?: Db } = {}
): InterimRule {
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);

	const { quorum, minDays } = input;
	if (quorum) {
		const whole = Number.isInteger(quorum.num) && Number.isInteger(quorum.den);
		if (!whole || quorum.num < 1 || quorum.den < 1 || quorum.num > quorum.den || quorum.den > 100) {
			error(400, 'A quorum is a share of the eligible members, like 3 of every 4.');
		}
	}
	if (minDays !== null && (!Number.isInteger(minDays) || minDays < 0 || minDays > MAX_DAYS)) {
		error(400, `Days open is a whole number from 0 to ${MAX_DAYS}.`);
	}

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());
	const before = interimRuleOf(ctx.community);
	const same =
		before.minDays === minDays &&
		before.quorum?.num === quorum?.num &&
		before.quorum?.den === quorum?.den;
	// Saving what is already recorded is not an event.
	if (same) return before;

	db.transaction((tx) => {
		tx.update(community)
			.set({
				interimQuorumNum: quorum?.num ?? null,
				interimQuorumDen: quorum?.den ?? null,
				interimMinDays: minDays,
				updatedAt: now
			})
			.where(eq(community.id, ctx.community.id))
			.run();

		/**
		 * In the community's own history, like its language and time zone: the
		 * rule every round is measured against changed, and members should be able
		 * to see when and by whom.
		 */
		tx.insert(changeLog)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				at: now,
				actorId: ctx.user.id,
				kind: 'community.adoption_rule_changed',
				subjectType: 'community',
				subjectId: ctx.community.id,
				summary: `Recorded the interim adoption rule: ${describe({ quorum, minDays })}`,
				payload: { quorum, minDays }
			})
			.run();
	});

	return { quorum, minDays };
}

/** "quorum 3/4, 7 days open" — for the change log, which is stored text. */
function describe(rule: InterimRule): string {
	const parts = [
		rule.quorum ? `quorum ${rule.quorum.num}/${rule.quorum.den}` : null,
		rule.minDays !== null ? `${rule.minDays} days open` : null
	].filter(Boolean);
	return parts.length > 0 ? parts.join(', ') : 'none';
}

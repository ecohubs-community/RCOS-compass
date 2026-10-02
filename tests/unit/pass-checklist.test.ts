import { describe, expect, it } from 'vitest';
import { interimRuleOf, passChecklist } from '../../src/lib/shared/pass-checklist.js';

/**
 * "What it takes to pass", as arithmetic. `openspec/changes/provenance-ui` D8,
 * the `consent` spec.
 */
const DAY = 86_400_000;
const OPENED = Date.UTC(2026, 8, 1, 12, 0);
const rule = { quorum: { num: 3, den: 4 }, minDays: 7 };

describe('what it takes to pass', () => {
	it('reads the spec’s example: 15 of 19 present, one objection, 6 of 7 days', () => {
		const checklist = passChecklist({
			eligible: 19,
			responded: 15,
			unresolvedObjections: 1,
			openedAt: OPENED,
			now: OPENED + 6 * DAY + 3_600_000,
			rule
		});
		expect(checklist).toEqual({
			ruleRecorded: true,
			present: { responded: 15, eligible: 19, needed: 15, met: true },
			objections: { open: 1, met: false },
			days: { open: 6, needed: 7, met: false }
		});
	});

	it.each([
		{ eligible: 4, num: 3, den: 4, needed: 3 },
		{ eligible: 5, num: 3, den: 4, needed: 4 },
		{ eligible: 3, num: 1, den: 2, needed: 2 },
		{ eligible: 0, num: 3, den: 4, needed: 0 }
	])(
		'rounds a quorum up: $num/$den of $eligible needs $needed',
		({ eligible, num, den, needed }) => {
			const checklist = passChecklist({
				eligible,
				responded: 0,
				unresolvedObjections: 0,
				openedAt: OPENED,
				now: OPENED,
				rule: { quorum: { num, den }, minDays: null }
			});
			expect(checklist.present.needed).toBe(needed);
		}
	);

	it('shows only facts, never a verdict, where there is no rule', () => {
		const checklist = passChecklist({
			eligible: 9,
			responded: 2,
			unresolvedObjections: 0,
			openedAt: OPENED,
			now: OPENED + 2 * DAY,
			rule: { quorum: null, minDays: null }
		});
		expect(checklist.ruleRecorded).toBe(false);
		expect(checklist.present.met).toBeNull();
		expect(checklist.days).toEqual({ open: 2, needed: null, met: null });
		// Objections are judged by consent itself, rule or no rule.
		expect(checklist.objections.met).toBe(true);
	});

	it('reads a half-recorded quorum as none', () => {
		expect(
			interimRuleOf({ interimQuorumNum: 3, interimQuorumDen: null, interimMinDays: 7 })
		).toEqual({ quorum: null, minDays: 7 });
		expect(
			interimRuleOf({ interimQuorumNum: null, interimQuorumDen: null, interimMinDays: null })
		).toEqual({ quorum: null, minDays: null });
	});
});

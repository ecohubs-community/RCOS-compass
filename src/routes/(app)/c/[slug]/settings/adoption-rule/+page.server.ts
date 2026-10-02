import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { interimRule, setInterimRule } from '$lib/server/services/adoption-rule';
import { run } from '$lib/server/http/form-action';
import type { Actions, PageServerLoad } from './$types';

/**
 * The community's interim adoption rule. UI spec §4.9,
 * `openspec/changes/provenance-ui` D8.
 *
 * Readable by every member — it is what every round they answer is measured
 * against — and recorded by a steward. It informs the round view and the freeze
 * form, and refuses nothing.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	return {
		rule: interimRule(ctx),
		can: { manage: ctxCan(ctx, 'settings.manage') }
	};
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const form = await request.formData();
		// Blank means "no rule for this part", not zero.
		const bad: string[] = [];
		const whole = (name: string) => {
			const raw = String(form.get(name) ?? '').trim();
			if (raw === '') return null;
			const parsed = Number(raw);
			if (!Number.isInteger(parsed)) bad.push(name);
			return parsed;
		};
		const num = whole('quorumNum');
		const den = whole('quorumDen');
		const minDays = whole('minDays');
		if (bad.length > 0) {
			return fail(400, { step: 'save', error: 'Each of these is a whole number.' });
		}
		if ((num === null) !== (den === null)) {
			return fail(400, { step: 'save', error: 'A quorum needs both numbers, like 3 of every 4.' });
		}

		return run('save', () =>
			setInterimRule(
				locals.ctx!,
				{ quorum: num !== null && den !== null ? { num, den } : null, minDays },
				{ db: getDb() }
			)
		);
	}
};

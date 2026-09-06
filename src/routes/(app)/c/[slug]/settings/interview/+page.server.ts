import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import type { Meets } from '$lib/server/db/schema/path';
import { getRiskProfile, setRiskProfile, RISK_QUESTIONS } from '$lib/server/services/risk-profile';
import type { Actions, PageServerLoad } from './$types';

/**
 * Five questions about the community, each of which moves something.
 * UI spec §4.4, `design.md` §4.
 *
 * Built here because the path screen needs somewhere to send a community that
 * has not answered them; the interview's own tests and the "no answer leaves
 * this community" checks are group 6.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const profile = getRiskProfile(ctx, { db: getDb() });

	return {
		questions: RISK_QUESTIONS.map((question) => ({
			id: question.id,
			question: question.question,
			answers: question.answers.map((answer) => ({ value: answer.value, label: answer.label }))
		})),
		answers: {
			holdsLand: profile?.holdsLand ?? null,
			sharedMoney: profile?.sharedMoney ?? null,
			childrenOnSite: profile?.childrenOnSite ?? null,
			founderOwner: profile?.founderOwner ?? null,
			meets: profile?.meets ?? null
		},
		can: { manage: ctxCan(ctx, 'settings.manage') }
	};
};

/** `''` is "not answered", which is a different thing from "no". */
const tri = (value: FormDataEntryValue | null): boolean | null =>
	value === null || value === '' ? null : value === 'yes';

export const actions: Actions = {
	save: async (event) => {
		const form = await event.request.formData();
		const meets = form.get('meets');

		setRiskProfile(
			event.locals.ctx!,
			{
				holdsLand: tri(form.get('holdsLand')),
				sharedMoney: tri(form.get('sharedMoney')),
				childrenOnSite: tri(form.get('childrenOnSite')),
				founderOwner: tri(form.get('founderOwner')),
				meets: meets === null || meets === '' ? null : (String(meets) as Meets)
			},
			{ db: getDb() }
		);
		return { saved: true };
	}
};

import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import type { Meets } from '$lib/server/db/schema/path';
import { activeStandardView } from '$lib/server/services/completeness';
import { getRiskProfile, interview, setRiskProfile } from '$lib/server/services/risk-profile';
import type { Actions, PageServerLoad } from './$types';

/**
 * Five questions about the community, each of which moves something.
 * UI spec §4.4, `design.md` §4.
 *
 * Each answer carries the sections it moves, resolved from the same mapping the
 * ordering uses. The screen shows them beside the answer rather than after it:
 * an interview that reorders a community's work without saying so is a worse
 * kind of hidden logic than a scoring function, because it feels like it was
 * the community's own choice.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const profile = getRiskProfile(ctx, { db });
	const standard = activeStandardView(db, ctx);

	return {
		questions: standard ? interview(standard.view, ctx.community.locale as 'en') : [],
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

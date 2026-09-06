import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { clearOverride, placeOverride } from '$lib/server/services/ordering';
import { effortLabel, path } from '$lib/server/services/path';
import { getRiskProfile } from '$lib/server/services/risk-profile';
import type { Actions, PageServerLoad } from './$types';

/**
 * The Path. UI spec §4.4 — everything still to decide, in an order the
 * community can see the reasons for and disagree with.
 *
 * The dashboard shows the first five; this is the whole list, and the place a
 * community argues with it.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	return {
		items: path(ctx, { db }).map((item) => ({
			sectionKey: item.sectionKey,
			question: item.question,
			reason: item.reason,
			effort: effortLabel(item.effort),
			clauseKey: item.clauseKey,
			discussionId: item.discussionId,
			override: item.override
		})),
		// Whether the ordering is structural or tailored, so a community is never
		// left assuming a list is about them when it is not.
		hasProfile: getRiskProfile(ctx, { db }) !== null,
		can: { manage: ctxCan(ctx, 'settings.manage') }
	};
};

export const actions: Actions = {
	place: async (event) => {
		const form = await event.request.formData();
		placeOverride(event.locals.ctx!, String(form.get('sectionKey')), Number(form.get('position')), {
			db: getDb()
		});
		return { moved: true };
	},

	clear: async (event) => {
		const form = await event.request.formData();
		clearOverride(event.locals.ctx!, String(form.get('sectionKey')), { db: getDb() });
		return { released: true };
	}
};

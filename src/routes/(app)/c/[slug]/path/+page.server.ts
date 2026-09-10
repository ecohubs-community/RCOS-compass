import { ctxCan } from '$lib/server/auth/guard';
import { activeStandardView } from '$lib/server/services/completeness';
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
/**
 * How many questions a screen opens with.
 *
 * A community on its first morning has ninety-four, and a page that opens with
 * all of them is a page nobody scrolls to the bottom of — the mockup's list ends
 * in "17 more questions below · Show all 23" for the same reason. `?all=1`
 * rather than a button, so it works with no JavaScript and survives a reload,
 * the way the standard browser's `?gaps=1` does.
 */
const FIRST_PAGE = 12;

export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const standard = activeStandardView(db, ctx);
	const layerNames = new Map((standard?.view.meta.layers ?? []).map((l) => [l.n, l.name]));
	const showAll = url.searchParams.get('all') === '1';

	const all = path(ctx, { db }).map((item) => ({
		sectionKey: item.sectionKey,
		question: item.question,
		reason: item.reason,
		effort: effortLabel(item.effort),
		clauseKey: item.clauseKey,
		discussionId: item.discussionId,
		override: item.override,
		layer: item.layer,
		/** `L1 · Membership`, the way every other screen in the mockups says it. */
		layerName: item.layer === null ? null : (layerNames.get(item.layer) ?? null)
	}));

	return {
		items: showAll ? all : all.slice(0, FIRST_PAGE),
		total: all.length,
		showAll,
		hidden: Math.max(0, all.length - (showAll ? all.length : FIRST_PAGE)),
		// Whether the ordering is structural or tailored, so a community is never
		// left assuming a list is about them when it is not.
		hasProfile: getRiskProfile(ctx, { db }) !== null,
		// Placing an item is publishing an order for everybody, which P1's matrix
		// makes a steward's act.
		can: { manage: ctxCan(ctx, 'path.publish') }
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

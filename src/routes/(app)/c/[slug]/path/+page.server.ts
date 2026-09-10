import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { activeStandardView } from '$lib/server/services/completeness';
import { getDb } from '$lib/server/db';
import {
	DEFAULT_WEIGHTS_PRESETS,
	clearOverride,
	discardPrivateOrder,
	placePrivate,
	privateOrderCount,
	publishPrivateOrder,
	releasePrivate,
	setWeights
} from '$lib/server/services/ordering';
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
		/**
		 * The draft the reader is sitting on, if any.
		 *
		 * Moving something is a member right (`path.reorder.private`) and it goes
		 * nowhere near anybody else; publishing that order for the community is a
		 * steward's (`path.publish`). `docs/04-security.md` §1 decided both, and
		 * until now only the second half existed — so a steward's drag was
		 * everybody's order the instant they let go, and a member could not drag
		 * at all.
		 */
		draft: { count: privateOrderCount(db, ctx.community.id, ctx.user.id) },
		presets: DEFAULT_WEIGHTS_PRESETS.map((preset) => preset.id),
		can: {
			reorder: ctxCan(ctx, 'path.reorder.private'),
			publish: ctxCan(ctx, 'path.publish'),
			tune: ctxCan(ctx, 'settings.manage')
		}
	};
};

export const actions: Actions = {
	/** Into the reader's own copy of the list, and nowhere else. */
	place: async (event) => {
		const form = await event.request.formData();
		placePrivate(event.locals.ctx!, String(form.get('sectionKey')), Number(form.get('position')), {
			db: getDb()
		});
		return { moved: true };
	},

	/** Drop one of your own placements. */
	release: async (event) => {
		const form = await event.request.formData();
		releasePrivate(event.locals.ctx!, String(form.get('sectionKey')), { db: getDb() });
		return { released: true };
	},

	/**
	 * Drop a placement the community published — a different act from releasing
	 * your own, done by a different person, so it is a different action rather
	 * than one button that means two things.
	 */
	unpin: async (event) => {
		const form = await event.request.formData();
		clearOverride(event.locals.ctx!, String(form.get('sectionKey')), { db: getDb() });
		return { released: true };
	},

	discard: async (event) => {
		discardPrivateOrder(event.locals.ctx!, { db: getDb() });
		return { discarded: true };
	},

	publish: async (event) => {
		const moved = publishPrivateOrder(event.locals.ctx!, { db: getDb() });
		return { published: moved };
	},

	/**
	 * A named starting point for the four strengths.
	 *
	 * The same setting the settings screen edits, reached from the screen where
	 * somebody notices the order is wrong. Every preset leaves `dependency` and
	 * `severity` where they ship, which is what keeps the structural order intact
	 * — see `defaultsPreserveStructure`. They differ in what pulls within it.
	 */
	preset: async (event) => {
		const form = await event.request.formData();
		const wanted = String(form.get('preset'));
		const preset = DEFAULT_WEIGHTS_PRESETS.find((p) => p.id === wanted);
		if (!preset) return fail(400, { error: 'No such preset.' });

		setWeights(event.locals.ctx!, { ...preset.weights }, { db: getDb() });
		return { preset: preset.id };
	}
};

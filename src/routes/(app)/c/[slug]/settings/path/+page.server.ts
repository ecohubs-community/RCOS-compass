import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { DEFAULT_WEIGHTS } from '$lib/server/db/schema/path';
import { activeWeights, setWeights, weightsHistory } from '$lib/server/services/ordering';
import { path } from '$lib/server/services/path';
import type { Actions, PageServerLoad } from './$types';

/**
 * How the path is ordered, as a screen. UI spec §4.4.
 *
 * "A visible, editable, versioned settings object, not hidden logic" is the
 * design brief, and this is the visible half. The point is not that communities
 * will tune these — it is that they *can*, which is what makes the default
 * arguable rather than imposed.
 *
 * The first version showed four numbers and four sentences, and a steward read
 * it as four numbers and four sentences: 250 against 10 says nothing about what
 * either one *does*. So the screen now answers that from the community's own
 * list — what each input is currently deciding, and how many of their questions
 * it is currently saying anything about at all. The numbers are still the
 * setting; they are no longer the explanation.
 */
const FIELDS = ['dependency', 'severity', 'risk', 'attention'] as const;
type Field = (typeof FIELDS)[number];

export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const history = weightsHistory(ctx, { db });
	const active = history.find((row) => row.active) ?? null;

	// One pass, used twice: the preview at the top of the list and the influence
	// each input actually has across all of it.
	const items = path(ctx, { db });

	/**
	 * What each input is doing right now, measured rather than asserted.
	 *
	 * `points` is `value × weight`, so the absolute points an input contributes
	 * across every open question is exactly its share of the ordering — including
	 * the case a weight cannot show on its own: an input set to 40 that no
	 * question triggers is deciding nothing, and the number alone looks busy.
	 */
	const totals = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
	const affects = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;

	for (const item of items) {
		for (const field of FIELDS) {
			const contribution = item.contributions[field];
			totals[field] += Math.abs(contribution.points);
			if (contribution.because !== null && contribution.points !== 0) affects[field] += 1;
		}
	}

	const grandTotal = FIELDS.reduce((sum, field) => sum + totals[field], 0);

	return {
		weights: activeWeights(db, ctx.community.id),
		defaults: DEFAULT_WEIGHTS,
		isDefault: active === null || active.isDefault,
		changedBy: active?.changedBy ?? null,
		changedAt: active?.changedAt.getTime() ?? null,
		influence: Object.fromEntries(
			FIELDS.map((field) => [
				field,
				{
					share: grandTotal === 0 ? 0 : Math.round((totals[field] / grandTotal) * 100),
					affects: affects[field]
				}
			])
		) as Record<Field, { share: number; affects: number }>,
		questions: items.length,
		// The previous opinion, so "what did this look like before" is answerable.
		history: history
			.filter((row) => !row.active)
			.slice(0, 5)
			.map((row) => ({
				dependency: row.dependency,
				severity: row.severity,
				risk: row.risk,
				attention: row.attention,
				changedAt: row.changedAt.getTime()
			})),
		// The first few items, so a change to the numbers is visible immediately
		// rather than on another screen.
		preview: items.slice(0, 8).map((item) => ({
			sectionKey: item.sectionKey,
			question: item.question,
			reason: item.reason
		})),
		can: { manage: ctxCan(ctx, 'settings.manage') }
	};
};

export const actions: Actions = {
	save: async (event) => {
		const form = await event.request.formData();

		/**
		 * A field left blank is not a zero.
		 *
		 * `Number('')` is 0, so an empty box used to save as "this input is off" —
		 * and boxes went empty on their own, because a successful `use:enhance`
		 * submit resets the form and Svelte only rewrites the inputs whose value
		 * changed. A steward who edited one number and saved twice silently zeroed
		 * the three they had not touched. The reset is gone; this refuses the
		 * shape anyway, because the action is reachable without JavaScript.
		 */
		const values = {} as Record<Field, number>;
		for (const field of FIELDS) {
			const raw = form.get(field);
			if (raw === null || String(raw).trim() === '') {
				return fail(400, { error: 'Every number needs a value. Use 0 to switch an input off.' });
			}
			values[field] = Number(raw);
		}

		try {
			setWeights(event.locals.ctx!, values, { db: getDb() });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400) return fail(400, { error: http.body?.message ?? '' });
			throw problem;
		}
		return { saved: true };
	},

	reset: async (event) => {
		setWeights(event.locals.ctx!, { ...DEFAULT_WEIGHTS }, { db: getDb() });
		return { saved: true };
	}
};

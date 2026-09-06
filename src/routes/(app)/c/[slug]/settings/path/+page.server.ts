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
 */
const FIELDS = ['dependency', 'severity', 'risk', 'attention'] as const;

export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const history = weightsHistory(ctx, { db });
	const active = history.find((row) => row.active) ?? null;

	return {
		weights: activeWeights(db, ctx.community.id),
		defaults: DEFAULT_WEIGHTS,
		isDefault: active === null || active.isDefault,
		changedBy: active?.changedBy ?? null,
		changedAt: active?.changedAt.getTime() ?? null,
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
		preview: path(ctx, { db, limit: 8 }).map((item) => ({
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
		const values = Object.fromEntries(
			FIELDS.map((field) => [field, Number(form.get(field))])
		) as Record<(typeof FIELDS)[number], number>;

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

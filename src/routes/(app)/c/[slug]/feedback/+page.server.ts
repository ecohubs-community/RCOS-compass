import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { listFeedback, markHandled, reportFeedback } from '$lib/server/services/feedback';
import type { Actions, PageServerLoad } from './$types';

/**
 * What this community has reported. `docs/08-roadmap-mvp.md` P7.
 *
 * Readable by every member rather than only by stewards: somebody who reports a
 * confusing screen should be able to see that it was not swallowed, and a
 * community that can see its own reports can tell when two of them are the same
 * problem.
 */
export const load: PageServerLoad = ({ locals }) => ({
	reports: listFeedback(locals.ctx!, { db: getDb() }),
	can: { manage: ctxCan(locals.ctx!, 'settings.manage') }
});

export const actions: Actions = {
	report: async (event) => {
		const form = await event.request.formData();
		try {
			reportFeedback(
				event.locals.ctx!,
				{
					route: String(form.get('route') ?? '/'),
					kind: String(form.get('kind') ?? 'other'),
					body: String(form.get('body') ?? '')
				},
				{ db: getDb() }
			);
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400) return fail(400, { error: http.body?.message ?? '' });
			throw problem;
		}
		return { sent: true };
	},

	handled: async (event) => {
		const form = await event.request.formData();
		markHandled(event.locals.ctx!, String(form.get('id') ?? ''), { db: getDb() });
		return { saved: true };
	}
};

import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { removeRemote, remoteView, setRemote } from '$lib/server/services/mirror';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where this community's history is kept. UI spec §8.1, `docs/00` §9.
 *
 * The local repository needs no configuration and is not a setting — it exists.
 * This screen is only about the *second* place the same commits go.
 */
export const load: PageServerLoad = ({ locals }) => ({
	remote: remoteView(locals.ctx!, { db: getDb() }),
	can: { manage: ctxCan(locals.ctx!, 'settings.manage') }
});

export const actions: Actions = {
	link: async (event) => {
		const form = await event.request.formData();
		try {
			setRemote(
				event.locals.ctx!,
				{
					url: String(form.get('url') ?? ''),
					credential: String(form.get('credential') ?? ''),
					includeRestricted: form.get('includeRestricted') === 'on'
				},
				{ db: getDb() }
			);
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400) return fail(400, { error: http.body?.message ?? '' });
			throw problem;
		}
		return { saved: true };
	},

	unlink: async (event) => {
		removeRemote(event.locals.ctx!, { db: getDb() });
		return { removed: true };
	}
};

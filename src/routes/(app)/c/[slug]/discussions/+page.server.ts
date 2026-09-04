import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listDiscussions, openDiscussion } from '$lib/server/services/discussions';
import { ctxCan } from '$lib/server/auth/guard';
import type { Actions, PageServerLoad } from './$types';

/** Every thread, newest activity first. UI spec §4.5. */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	return {
		canStart: ctxCan(ctx, 'discussion.create'),
		discussions: listDiscussions(ctx).map((thread) => ({
			id: thread.id,
			title: thread.title,
			status: thread.status,
			origin: thread.origin,
			lastActivityAt: thread.lastActivityAt.getTime()
		}))
	};
};

export const actions: Actions = {
	open: async (event) => {
		const form = await event.request.formData();
		const title = String(form.get('title') ?? '').trim();
		const clauseKey = String(form.get('clauseKey') ?? '').trim();

		if (!title) return fail(400, { error: 'Give the discussion a title.' });

		const thread = openDiscussion(
			event.locals.ctx!,
			{ title, about: { kind: 'clause', clauseKey: clauseKey || 'unassigned' } },
			{ db: getDb() }
		);

		redirect(303, `/c/${event.params.slug}/discussions/${thread.id}`);
	}
};

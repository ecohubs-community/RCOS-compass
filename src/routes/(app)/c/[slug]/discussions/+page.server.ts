import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listDiscussions, openDiscussion } from '$lib/server/services/discussions';
import { ctxCan } from '$lib/server/auth/guard';
import type { Actions, PageServerLoad } from './$types';

/** Every thread, newest activity first. UI spec §4.5. */
export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	return {
		canStart: ctxCan(ctx, 'discussion.create'),
		// Arrived from the dashboard's "Start discussion": the question is already
		// chosen, so the clause should not have to be typed again.
		clauseKey: url.searchParams.get('clause') ?? '',
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

		let thread;
		try {
			thread = openDiscussion(
				event.locals.ctx!,
				{
					title,
					// The field says optional, so an empty one opens a thread about an
					// open question rather than one about a clause called "unassigned"
					// — which no standard contains, and which no freeze could resolve.
					about: clauseKey ? { kind: 'clause', clauseKey } : { kind: 'open_question' }
				},
				{ db: getDb() }
			);
		} catch (problem) {
			// A clause that does not exist is a typo in the box in front of them.
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400 || http.status === 409) {
				return fail(http.status, { error: http.body?.message ?? 'That did not work.' });
			}
			throw problem;
		}

		redirect(303, `/c/${event.params.slug}/discussions/${thread.id}`);
	}
};

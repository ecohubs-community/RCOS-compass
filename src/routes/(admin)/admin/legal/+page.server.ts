import { fail } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { reviewLegalDocument, legalDocumentsForReview } from '$lib/server/services/admin/legal';
import type { Actions, PageServerLoad } from './$types';

/**
 * Marking a legal document reviewed. `docs/10-legal-and-operations.md` §6.
 *
 * The console does not edit the text — that lives in git, where it is diffed and
 * deployed with the code it describes. What it records is the operational fact
 * that one exact wording was read by somebody with the standing to say so, keyed
 * to the hash of that wording, so the next edit re-arms the draft notice without
 * anybody remembering to.
 */
export const load: PageServerLoad = ({ locals }) => {
	requirePlatformAdmin(locals.user);
	return { documents: legalDocumentsForReview(getDb()) };
};

export const actions: Actions = {
	default: async (event) => {
		requirePlatformAdmin(event.locals.user);
		const form = await event.request.formData();

		try {
			reviewLegalDocument(getDb(), {
				id: String(form.get('id') ?? ''),
				sha256: String(form.get('sha256') ?? ''),
				reviewedBy: event.locals.user!.id,
				note: String(form.get('note') ?? ''),
				now: systemClock.now()
			});
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 409 || http.status === 404) {
				return fail(http.status, { error: http.body?.message ?? '' });
			}
			throw problem;
		}
		return { saved: true };
	}
};

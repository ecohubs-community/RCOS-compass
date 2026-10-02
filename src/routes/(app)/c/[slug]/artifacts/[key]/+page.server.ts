import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { artifactDetail } from '$lib/server/services/artifacts';
import { publishArtifact, withdrawArtifact } from '$lib/server/services/publishing';
import type { Actions, PageServerLoad } from './$types';

/**
 * One artifact. UI spec §4.8 — "one page per mandatory artifact showing
 * completeness and the clauses that feed it" — and design artboard 15.
 *
 * Everything is read in `services/artifacts.ts`; the counts are the ones the
 * Artifacts list and readiness use, so the three cannot disagree.
 */
export const load: PageServerLoad = ({ locals, params }) => {
	const ctx = locals.ctx!;
	return {
		artifact: artifactDetail(ctx, params.key, { db: getDb() }),
		can: { publish: ctxCan(ctx, 'artifact.publish'), discuss: ctxCan(ctx, 'discussion.create') }
	};
};

export const actions: Actions = {
	/** Publish or withdraw, as one act with one decision — the settings page's own path. */
	publish: async ({ locals, params, request }) => {
		const form = await request.formData();
		try {
			if (form.get('withdraw') === '1') withdrawArtifact(locals.ctx!, params.key, { db: getDb() });
			else publishArtifact(locals.ctx!, params.key, { db: getDb() });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 409) return fail(409, { error: http.body?.message ?? '' });
			throw problem;
		}
		return { published: form.get('withdraw') !== '1' };
	}
};

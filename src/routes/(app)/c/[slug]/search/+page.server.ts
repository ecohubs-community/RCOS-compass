import { getDb } from '$lib/server/db';
import { lookup } from '$lib/server/services/lookup';
import type { PageServerLoad } from './$types';

/**
 * Reverse lookup. UI spec §4.9.
 *
 * The page answers with citations and nothing else — no summary, no sentence of
 * ours, and no model anywhere in the path. §1.3 promises the application will
 * never tell a community what its governance should say, and this is the screen
 * where that promise is easiest to break by accident.
 */
export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const question = url.searchParams.get('q')?.trim() ?? '';

	if (!question) {
		return { question, terms: [], ignored: [], clauses: [], ours: [], asked: false };
	}

	return { ...lookup(ctx, question, { db: getDb() }), asked: true };
};

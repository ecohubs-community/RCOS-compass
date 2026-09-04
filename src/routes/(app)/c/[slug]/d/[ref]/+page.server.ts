import { getDb } from '$lib/server/db';
import { decisionDetail } from '$lib/server/services/decisions';
import type { PageServerLoad } from './$types';

/**
 * A decision's permalink. docs/03-data-model.md §6: refs are permanent and
 * quotable, and this is what they point at.
 */
export const load: PageServerLoad = ({ locals, params }) => {
	return { detail: decisionDetail(locals.ctx!, params.ref, { db: getDb() }) };
};

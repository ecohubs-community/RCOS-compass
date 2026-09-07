import { getDb } from '$lib/server/db';
import { glossary } from '$lib/server/services/glossary';
import type { PageServerLoad } from './$types';

/**
 * The glossary. UI spec §4.8 — the standard's vocabulary with the community's
 * own words beside it.
 *
 * Derived at read time and stored nowhere, so it cannot be stale and nobody has
 * to maintain it.
 */
export const load: PageServerLoad = ({ locals }) => ({
	terms: glossary(locals.ctx!, { db: getDb() })
});

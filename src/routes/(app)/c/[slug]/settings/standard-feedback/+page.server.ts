import { requirePermission } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { listStandardFeedback } from '$lib/server/services/standard-feedback';
import type { PageServerLoad } from './$types';

/**
 * What this community wished the standard had asked for. UI spec §1.4b kind 3.
 *
 * Readable by every member, like *What we are not showing*: the entries are
 * members' own words, recorded by a member right, and there is nothing on the
 * page to change. Sharing them upstream is a deliberate act that happens
 * outside the product — copied from here, or carried in the export.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	requirePermission(ctx, 'community.read');

	return {
		entries: listStandardFeedback(ctx, { db: getDb() })
	};
};

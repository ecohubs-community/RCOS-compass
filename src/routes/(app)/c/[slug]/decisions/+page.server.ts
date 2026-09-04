import { getDb } from '$lib/server/db';
import { listDecisions, searchDecisions } from '$lib/server/services/decisions';
import type { PageServerLoad } from './$types';

/**
 * The decision register. UI spec §4.7.
 *
 * The search box is the point of the page, not a convenience: a member a year
 * from now remembers the question, not the reference. It is styled as a real
 * question — "Can we spend €800 on the water pump?" — because that is what
 * people actually type.
 */
export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const query = url.searchParams.get('q')?.trim() ?? '';

	const rows = query ? searchDecisions(ctx, query, { db: getDb() }) : listDecisions(ctx);

	return {
		query,
		decisions: rows.map((decision) => ({
			ref: decision.ref,
			title: decision.title,
			type: decision.type,
			layer: decision.layer,
			decidedAt: decision.decidedAt.getTime(),
			reviewDueAt: decision.reviewDueAt?.getTime() ?? null,
			mechanism: decision.mechanism,
			tallyFor: decision.tallyFor,
			tallyPresent: decision.tallyPresent,
			status: decision.status,
			provisional: decision.provisional,
			unresolvedObjections: decision.unresolvedObjections
		}))
	};
};

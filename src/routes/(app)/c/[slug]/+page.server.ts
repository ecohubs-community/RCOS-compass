import { listDecisions } from '$lib/server/services/decisions';
import { needsAttention, path } from '$lib/server/services/path';
import type { PageServerLoad } from './$types';

/**
 * The dashboard. UI spec §4.1 — four blocks, not a stats wall.
 *
 * Authorised by the tenant layout above, which resolves the community from the
 * URL and refuses anything else; this load reads what that layout established.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;

	return {
		// The hero block: five plain-language questions, not clause text.
		next: path(ctx, { limit: 5 }),
		remaining: path(ctx).length,
		attention: needsAttention(ctx),
		recent: listDecisions(ctx)
			.slice(0, 5)
			.map((decision) => ({
				ref: decision.ref,
				title: decision.title,
				decidedAt: decision.decidedAt.getTime(),
				mechanism: decision.mechanism,
				tallyFor: decision.tallyFor,
				tallyPresent: decision.tallyPresent,
				provisional: decision.provisional,
				status: decision.status
			}))
	};
};

import { listDecisions } from '$lib/server/services/decisions';
import { languageCoverage } from '$lib/server/services/evidence';
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
	// Ordered once and sliced. Asking twice ran the dependency ordering over
	// every authored section twice, to show five of them and a count.
	const remaining = path(ctx);

	return {
		// The hero block: five plain-language questions, not clause text.
		next: remaining.slice(0, 5),
		remaining: remaining.length,
		/**
		 * "You already have language for N of M requirements."
		 *
		 * The adoption-unlock number (UI spec §4.5), kept deliberately apart from
		 * readiness: having written something about a clause is not having decided
		 * it, and a community must never read this as progress toward compliance.
		 */
		language: languageCoverage(ctx),
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

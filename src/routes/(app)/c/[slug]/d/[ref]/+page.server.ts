import { getDb } from '$lib/server/db';
import { decisionDetail } from '$lib/server/services/decisions';
import { parseMarkdown } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

/**
 * A decision's permalink. docs/03-data-model.md §6: refs are permanent and
 * quotable, and this is what they point at.
 *
 * Mapped to an explicit shape like every other loader, rather than handing the
 * row over: the row carries the freeze's idempotency key and internal ids, and
 * this is the page that goes to some lengths not to name people who did not
 * consent to being named.
 */
export const load: PageServerLoad = ({ locals, params }) => {
	const detail = decisionDetail(locals.ctx!, params.ref, { db: getDb() });
	const d = detail.decision;

	return {
		decision: {
			ref: d.ref,
			title: d.title,
			type: d.type,
			layer: d.layer,
			status: d.status,
			provisional: d.provisional,
			mechanism: d.mechanism,
			threshold: d.threshold,
			tallyPresent: d.tallyPresent,
			tallyFor: d.tallyFor,
			tallyAgainst: d.tallyAgainst,
			unresolvedObjections: d.unresolvedObjections,
			// Parsed, because the thread this came from renders it parsed and this
			// is the copy people quote. A record that formats differently from the
			// text that was reviewed is a record that reads differently.
			proposalText: parseMarkdown(d.proposalText),
			rationale: d.rationale,
			decidedAt: d.decidedAt.getTime(),
			reviewDueAt: d.reviewDueAt?.getTime() ?? null,
			source: d.source
		},
		clauses: detail.clauses,
		attendees: detail.attendees,
		supersededBy: detail.supersededBy,
		supersedes: detail.supersedes
	};
};

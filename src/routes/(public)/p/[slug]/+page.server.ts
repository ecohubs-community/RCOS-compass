import { anonymousIn } from '$lib/server/auth/audience';
import { getDb } from '$lib/server/db';
import { outwardClaim } from '$lib/server/services/claim';
import { standardViewFor } from '$lib/server/services/completeness';
import { publishedArtifacts } from '$lib/server/services/public-index';
import type { PageServerLoad } from './$types';

/**
 * The public artifact index, in the shape of RCOS Appendix C.6.
 *
 * The appendix asks for four things: the artifacts with their links and dates,
 * a compliance statement with the date of the last self-audit, an explicit
 * statement of what is private and why, and the standard version in use. All
 * four are here, and **no percentage is** — the claim this page renders has no
 * field one could be computed from.
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { community } = await parent();
	const db = getDb();
	const audience = anonymousIn(community.id);
	const standard = standardViewFor(db, community.id);

	return {
		claim: outwardClaim(audience, { db }),
		artifacts: publishedArtifacts(db, audience),
		standard: standard ? { id: standard.row.standardId, version: standard.row.version } : null
	};
};

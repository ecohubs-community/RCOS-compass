import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { communityArtifact } from '../db/schema/definitions.js';
import { communityStandard } from '../db/schema/tenancy.js';
import { reached } from './funnel.js';
import { CORE_STANDARD_ID, CORE_STANDARD_VERSION } from './readiness.js';

/**
 * What a community comes with on its first day.
 *
 * This exists as its own module because of who calls it. Creating a tenant is an
 * administrative act, and the admin console may not reach into content tables
 * (docs/05-admin-console.md §2) — an import test enforces that, and it is right
 * to. So the console asks for a community to be *set up* and is handed one; it
 * never inserts a content row itself, and never gains the ability to read one.
 *
 * Called inside the caller's transaction, so a community and the things it comes
 * with either both exist or neither does.
 */
export function seedCommunityDefaults(
	tx: Db,
	{ communityId, now }: { communityId: string; now: number }
): void {
	/**
	 * The standard the community is answering to.
	 *
	 * Without this row a community is inert: `activeStandardView` returns null,
	 * and the Path, the glossary, the interview, the standard screen and
	 * readiness all render empty — a product that looks broken on the first
	 * morning of every tenant created through the console. It was missing because
	 * the one place a community got made in anger was the test seed, which
	 * inserted the row itself immediately afterwards and so hid the hole from
	 * every suite.
	 *
	 * Adopted rather than offered: there is one core standard and one vendored
	 * version, and a community that has not chosen one cannot do anything at all.
	 */
	tx.insert(communityStandard)
		.values({
			id: newId(),
			communityId,
			standardId: CORE_STANDARD_ID,
			version: CORE_STANDARD_VERSION,
			status: 'active',
			adoptedAt: new Date(now),
			retiredAt: null
		})
		.run();

	// The shelf a community's own rules go on. Created with the community rather
	// than on demand: a community that has to build a container before writing
	// its first house rule will write the house rule somewhere else.
	tx.insert(communityArtifact)
		.values({
			id: newId(),
			communityId,
			title: 'Community Agreements',
			description:
				'Rules this community decided for itself. RCOS does not ask for these, and they move no number.',
			layer: null,
			order: 0,
			kind: 'default',
			createdAt: new Date(now)
		})
		.run();

	// The first of the seven onboarding milestones, inside the transaction that
	// creates the community — so a community that failed to be created did not
	// reach it. `docs/00` §12.
	reached(tx, communityId, 'community.created', now);
}

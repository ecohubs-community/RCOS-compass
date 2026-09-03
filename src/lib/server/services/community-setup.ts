import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { communityArtifact } from '../db/schema/definitions.js';

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
}

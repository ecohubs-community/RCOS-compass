import { readdirSync } from 'node:fs';
import { and, eq, lt } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import { getConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { community } from '../db/schema/tenancy.js';
import { removeCommunityFiles } from '../documents/storage.js';
import { DELETE_GRACE_MS } from '../services/admin/communities.js';
import { getLogger } from '../logger.js';

/**
 * Hard deletion, after the grace period. docs/05-admin-console.md §3.3.
 *
 * A soft-deleted community is recoverable for thirty days and then genuinely
 * gone — and "gone" has to include the files, which is the part a database
 * cascade cannot do. A community that asked to leave and finds its bylaws still
 * sitting on somebody's volume has not left.
 *
 * Rows first, then files. If the process dies between the two, what is left is
 * a directory nothing references, which the orphan sweep below removes on the
 * next run. The other order risks deleting the files of a community whose rows
 * survived — which is the same event seen from the wrong side, except that this
 * one is not recoverable.
 */
export async function purgeDeletedCommunities(
	db: Db,
	clock: Clock
): Promise<{ purged: number; orphansRemoved: number }> {
	const now = clock.now();

	const due = db
		.select({ id: community.id })
		.from(community)
		.where(
			and(eq(community.status, 'deleted'), lt(community.deletedAt, new Date(now - DELETE_GRACE_MS)))
		)
		.all();

	for (const row of due) {
		// Everything a community holds hangs off this row by a cascading key.
		db.delete(community).where(eq(community.id, row.id)).run();
	}

	return { purged: due.length, orphansRemoved: await sweepOrphanDirectories(db) };
}

/**
 * Directories belonging to no community.
 *
 * The self-healing half: a crash between the row delete and the file delete
 * leaves exactly this, and so does any older bug that forgot the files. Run on
 * every purge, so the untidy state is temporary rather than permanent.
 */
async function sweepOrphanDirectories(db: Db): Promise<number> {
	const root = getConfig().UPLOAD_DIR;

	let entries: string[];
	try {
		entries = readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			// `.incoming` holds part-written uploads, and is not a community.
			.filter((entry) => !entry.name.startsWith('.'))
			.map((entry) => entry.name);
	} catch {
		// No upload directory yet is not a problem; it means nobody has uploaded.
		return 0;
	}

	let removed = 0;
	for (const communityId of entries) {
		const exists = db
			.select({ id: community.id })
			.from(community)
			.where(eq(community.id, communityId))
			.get();
		if (exists) continue;

		// Awaited: the job's return value says these are gone, and a fire-and-
		// forget removal makes that a claim rather than a fact — a worker killed
		// straight after would have logged a removal that never happened.
		try {
			await removeCommunityFiles(communityId);
			removed += 1;
		} catch (error) {
			getLogger().error({ communityId, err: error }, 'could not remove orphaned upload directory');
		}
	}

	return removed;
}

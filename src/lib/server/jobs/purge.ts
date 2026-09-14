import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, lt } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import { getConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { document, documentFileVersion } from '../db/schema/documents.js';
import { producedFile } from '../db/schema/self-audit.js';
import { community } from '../db/schema/tenancy.js';
import { removeCommunityFiles, removeFile } from '../documents/storage.js';
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

	const orphansRemoved = (await sweepOrphanDirectories(db)) + (await sweepOrphanFiles(db, now));
	return { purged: due.length, orphansRemoved };
}

/**
 * How old an unreferenced file must be before it counts as an orphan. A
 * replacement moves its file into place a moment *before* the rows that point at
 * it are written; the grace keeps a sweep from racing that window.
 */
export const ORPHAN_FILE_GRACE_MS = 60 * 60_000;

/**
 * Files inside a live community's directory that nothing references.
 *
 * The per-file half of the self-healing: removing a document, deleting a
 * version, or a replacement whose rows could not be written each remove a file
 * *after* the rows change, and a process that dies in between leaves the file.
 * Only plain files directly in the community directory are candidates — exports
 * and the git mirror live in subdirectories with their own lifecycles.
 */
async function sweepOrphanFiles(db: Db, now: number): Promise<number> {
	const root = getConfig().UPLOAD_DIR;
	const referenced = new Set(
		[
			...db.select({ key: document.storageKey }).from(document).all(),
			...db.select({ key: documentFileVersion.storageKey }).from(documentFileVersion).all(),
			...db.select({ key: producedFile.storageKey }).from(producedFile).all()
		].map((row) => row.key)
	);

	let removed = 0;
	for (const live of db.select({ id: community.id }).from(community).all()) {
		let names: string[];
		try {
			names = readdirSync(join(root, live.id), { withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) => entry.name);
		} catch {
			continue;
		}

		for (const name of names) {
			const key = `${live.id}/${name}`;
			if (referenced.has(key)) continue;
			try {
				if (now - statSync(join(root, key)).mtimeMs < ORPHAN_FILE_GRACE_MS) continue;
				await removeFile(key);
				removed += 1;
			} catch (problem) {
				getLogger().error({ key, err: problem }, 'could not remove orphaned upload');
			}
		}
	}
	return removed;
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

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

/**
 * Taking a copy, and getting it back. `docs/00-architecture.md` §9.
 *
 * **The database and the uploads are one thing.** A restore that returns the
 * decisions and loses the bylaws they were mapped from is a broken restore, and
 * it is broken in the way nobody notices until the day it matters — the rows are
 * all there. So a snapshot is a directory containing both, and a restore refuses
 * one that is missing either half.
 *
 * `VACUUM INTO` rather than copying the file: it takes a consistent copy of a
 * database that is being written to, which is the only kind this instance has.
 * Copying `compass.db` while a write is in flight produces a file that opens and
 * is wrong.
 */

export type SnapshotPaths = { databaseFile: string; uploadDir: string };

export const DATABASE_IN_SNAPSHOT = 'db.sqlite';
export const UPLOADS_IN_SNAPSHOT = 'uploads';

/** `file:./data/compass.db` is configuration; this is the path on disk. */
export const databasePath = (url: string): string => url.replace(/^file:/, '');

export function snapshot(paths: SnapshotPaths, into: string): { directory: string } {
	mkdirSync(into, { recursive: true });

	const database = new Database(paths.databaseFile, { readonly: true });
	try {
		// Consistent, and takeable while the instance is serving: the point of
		// VACUUM INTO over a file copy.
		database.exec(`vacuum into '${join(into, DATABASE_IN_SNAPSHOT).replace(/'/g, "''")}'`);
	} finally {
		database.close();
	}

	// The uploads go with it, always. There is no snapshot of one half.
	const uploads = join(into, UPLOADS_IN_SNAPSHOT);
	mkdirSync(uploads, { recursive: true });
	if (existsSync(paths.uploadDir)) {
		for (const entry of readdirSync(paths.uploadDir)) {
			cpSync(join(paths.uploadDir, entry), join(uploads, entry), { recursive: true });
		}
	}

	return { directory: into };
}

export class RestoreRefused extends Error {}

export function restore(from: string, paths: SnapshotPaths): void {
	const database = join(from, DATABASE_IN_SNAPSHOT);
	const uploads = join(from, UPLOADS_IN_SNAPSHOT);

	if (!existsSync(database) || !existsSync(uploads)) {
		throw new RestoreRefused(
			`${from} is not a complete snapshot — it needs both ${DATABASE_IN_SNAPSHOT} and ${UPLOADS_IN_SNAPSHOT}/. ` +
				'Restoring half of one is how a community gets its decisions back without the documents they were mapped from.'
		);
	}

	/**
	 * A write-ahead log beside the target is the trap here.
	 *
	 * SQLite would replay it over the file we just restored and bring back
	 * exactly the pages the restore was meant to replace. They go first, and
	 * before the database rather than after.
	 */
	for (const suffix of ['-wal', '-shm']) {
		rmSync(`${paths.databaseFile}${suffix}`, { force: true });
	}

	if (existsSync(paths.databaseFile) && isOpen(paths.databaseFile)) {
		throw new RestoreRefused(
			'Something has this database open. Stop the instance before restoring — a restore under a ' +
				'running server produces a database neither of them agrees about.'
		);
	}

	mkdirSync(basename(paths.databaseFile) === paths.databaseFile ? '.' : dirOf(paths.databaseFile), {
		recursive: true
	});
	cpSync(database, paths.databaseFile);

	rmSync(paths.uploadDir, { recursive: true, force: true });
	cpSync(uploads, paths.uploadDir, { recursive: true });
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '.';

/**
 * Whether a server is holding this database.
 *
 * SQLite has no "who has this open", so this asks the only question it can
 * answer: can an exclusive lock be taken. A reader can hold one open without a
 * WAL file, so the WAL's presence is not the test.
 */
function isOpen(file: string): boolean {
	if (!existsSync(file) || statSync(file).size === 0) return false;
	const database = new Database(file);
	try {
		database.exec('begin exclusive');
		database.exec('rollback');
		return false;
	} catch {
		return true;
	} finally {
		database.close();
	}
}

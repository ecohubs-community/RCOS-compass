#!/usr/bin/env node
/**
 * Start the built app for an e2e run, from an empty database.
 *
 * `data/e2e.db` used to survive from one run to the next, and so did its job
 * queue: hundreds of mail jobs retrying against a transport the suite does not
 * have, and a tail of claim checks and mirror commits. The in-process worker
 * takes one job per tick, so behind that backlog a document uploaded by a spec
 * waited longer than the spec did and every document screen stayed on
 * "Reading". A test that passes or fails by what earlier runs left behind is
 * not testing the application. So each run starts clean: the database, its WAL
 * and shared-memory files, and the upload folder that goes with it.
 *
 * Only what this server's own environment names, and only inside `./data`:
 * `DATABASE_URL` and `UPLOAD_DIR` come from `playwright.config.ts`, and a
 * mistake there must not be able to reach the development database. Migrations
 * run at boot (`docs/00` §runtime), so an empty file is a working database.
 *
 * A server Playwright reuses (`reuseExistingServer` outside CI) never runs this
 * and keeps the database it has. Stop it to get a clean run.
 *
 * Usage (as `webServer.command`): node scripts/e2e-server.mjs
 */
import { existsSync, rmSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('data');
/** The development server's own state, at its defaults (`src/lib/server/config.ts`). */
const DEVELOPMENT = [resolve('data/compass.db'), resolve('data/uploads')];

/** A path this script may delete: inside ./data, and not the development server's. */
function disposable(path, what) {
	const at = resolve(path);
	if (!at.startsWith(root + sep)) {
		throw new Error(`Refusing to reset ${what} outside ./data: ${at}`);
	}
	if (DEVELOPMENT.includes(at)) {
		throw new Error(`Refusing to reset the development server's ${what}: ${at}`);
	}
	return at;
}

// Both paths are checked before anything is deleted, so a bad value for one
// never costs the other.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set; playwright.config.ts sets it.');
const database = disposable(url.startsWith('file:') ? url.slice('file:'.length) : url, 'database');
const uploads = process.env.UPLOAD_DIR ? disposable(process.env.UPLOAD_DIR, 'upload folder') : null;

for (const file of [database, `${database}-wal`, `${database}-shm`]) {
	rmSync(file, { force: true });
}
if (uploads && existsSync(uploads)) rmSync(uploads, { recursive: true, force: true });

console.log(`e2e: starting from an empty ${basename(database)}`);
await import(pathToFileURL(resolve('build/index.js')).href);

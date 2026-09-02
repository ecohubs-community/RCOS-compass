import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from '../config.js';
import * as schema from './schema/index.js';

export type Db = BetterSQLite3Database<typeof schema>;

/** `file:./data/compass.db` -> `./data/compass.db`; `:memory:` passes through. */
export function resolveDatabasePath(databaseUrl: string): string {
	return databaseUrl.startsWith('file:') ? databaseUrl.slice('file:'.length) : databaseUrl;
}

export function openDatabase(databaseUrl: string): { db: Db; close: () => void } {
	const path = resolveDatabasePath(databaseUrl);
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

	const sqlite = new Database(path);
	// WAL: concurrent readers alongside one writer, which is exactly the
	// single-instance shape of docs/00-architecture.md §6.
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	// Wait rather than throw when the single writer is busy.
	sqlite.pragma('busy_timeout = 5000');

	return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}

/**
 * Applies pending migrations.
 *
 * Safe to run at boot **only because the MVP is single-instance**
 * (docs/00-architecture.md §6). When a second process is ever added, migrations
 * move to a release step and this call must go with them.
 */
export function migrateDatabase(db: Db, migrationsFolder = './drizzle'): void {
	migrate(db, { migrationsFolder });
}

let singleton: { db: Db; close: () => void } | null = null;

let override: Db | null = null;

export function getDb(): Db {
	if (override) return override;
	singleton ??= openDatabase(getConfig().DATABASE_URL);
	return singleton.db;
}

/**
 * Test seam. Services resolve the database through `getDb()` rather than taking
 * it as a parameter, so a test points that at its own migrated file.
 */
export function setDbForTests(db: Db | null): void {
	override = db;
}

/**
 * Opens the database and brings it up to date. Called once from
 * `hooks.server.ts`, before the first request is served.
 *
 * Migrating at boot is safe **only because the MVP is single-instance**
 * (docs/00-architecture.md §6). Two processes racing this would corrupt the
 * migration table, so when a second instance is ever added, this call moves to a
 * release step.
 */
export function initDatabase(): Db {
	const db = getDb();
	migrateDatabase(db);
	return db;
}

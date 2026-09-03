#!/usr/bin/env node
/**
 * Apply pending migrations, without starting a server.
 *
 * The server migrates at boot (`initDatabase()` in `hooks.server.ts`), which is
 * right while the MVP is single-instance. This exists for the two cases that are
 * not a boot: looking at a database before running anything against it, and the
 * release step a second instance will need, when migrating at boot stops being
 * safe (`docs/00-architecture.md` §6).
 *
 * Plain `.mjs`, and it does not import the application. The application's modules
 * use `.js` specifiers that only a TypeScript-aware resolver rewrites, so a plain
 * `node` invocation cannot load them — the same class of difference that made
 * `pnpm preview` fail with "BETTER_AUTH_SECRET is required" next to a perfectly
 * good `.env`. This is a tool that runs outside the application, like
 * `drizzle.config.ts`, and it is exempt from the no-`process.env` rule for the
 * same reason.
 *
 * It insists on being told which database rather than defaulting to one. A
 * migration tool that guesses is a migration tool that eventually migrates the
 * wrong file, and there is no undo.
 */
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error(
		'DATABASE_URL is not set, and this tool will not guess.\n' +
			'  Local:   put it in .env (pnpm db:migrate loads it)\n' +
			'  Release: set it in the environment'
	);
	process.exit(1);
}

const path = url.replace(/^file:/, '');
const existed = existsSync(path);

const sqlite = new Database(path);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

try {
	migrate(drizzle(sqlite), { migrationsFolder: './drizzle' });
	console.log('%s %s', existed ? 'Migrated' : 'Created and migrated', path);
} finally {
	sqlite.close();
}

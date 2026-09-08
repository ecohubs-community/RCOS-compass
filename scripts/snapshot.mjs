#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
/**
 * `pnpm snapshot [directory]` — the database and the uploads, together.
 *
 * A script rather than a job, because a backup that only runs while the
 * application is healthy is not a backup. It can run against a live instance.
 */
const { snapshot, databasePath } = await import('../src/lib/server/durability.ts');

const root = process.argv[2] ?? './data/snapshots';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const into = join(root, stamp);
mkdirSync(root, { recursive: true });

const result = snapshot(
	{
		databaseFile: databasePath(process.env.DATABASE_URL ?? 'file:./data/compass.db'),
		uploadDir: process.env.UPLOAD_DIR ?? './data/uploads'
	},
	into
);

console.log(`snapshot written to ${result.directory}`);

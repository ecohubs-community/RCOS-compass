#!/usr/bin/env node
/** `pnpm restore <snapshot-directory>` — both halves, or neither. */
const { restore, databasePath, RestoreRefused } = await import('../src/lib/server/durability.ts');

const from = process.argv[2];
if (!from) {
	console.error('usage: pnpm restore <snapshot-directory>');
	process.exit(2);
}

try {
	restore(from, {
		databaseFile: databasePath(process.env.DATABASE_URL ?? 'file:./data/compass.db'),
		uploadDir: process.env.UPLOAD_DIR ?? './data/uploads'
	});
	console.log(`restored from ${from}`);
} catch (problem) {
	if (problem instanceof RestoreRefused) {
		console.error(problem.message);
		process.exit(1);
	}
	throw problem;
}

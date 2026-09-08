import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DATABASE_IN_SNAPSHOT,
	RestoreRefused,
	restore,
	snapshot,
	UPLOADS_IN_SNAPSHOT
} from '../../src/lib/server/durability.js';

/**
 * The drill, run rather than described. `docs/00-architecture.md` §9.
 *
 * The criterion is in the architecture document in these words — *the quarterly
 * drill restores both and re-opens a mapped document* — and a criterion nobody
 * has executed is a paragraph. So this seeds a community with a document and a
 * passage mapped to a clause, snapshots it, restores it somewhere else, and
 * reads the passage and its file back out of the restored copy.
 *
 * It uses raw SQL over a migrated database rather than the services, because
 * what is under test is the file on disk: a restore that produces rows the
 * application can read is exactly what a service-level test would assume.
 */
const ROOT = join(import.meta.dirname, '../..');

let dir: string;
let databaseFile: string;
let uploadDir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'compass-drill-'));
	databaseFile = join(dir, 'live', 'compass.db');
	uploadDir = join(dir, 'live', 'uploads');
	mkdirSync(join(dir, 'live'), { recursive: true });
	mkdirSync(uploadDir, { recursive: true });
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** A community, a document, and a passage of it mapped to a clause. */
function seedLiveInstance(): { storageKey: string; passage: string } {
	const database = new Database(databaseFile);
	database.pragma('journal_mode = WAL');
	migrate(drizzle(database), { migrationsFolder: join(ROOT, 'drizzle') });

	database.exec(`
		insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
			ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
		values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1);

		insert into document (id, community_id, filename, mime, bytes, sha256, storage_key,
			status, uploaded_at)
		values ('doc1', 'c1', 'bylaws.pdf', 'application/pdf', 12, 'x', 'c1/doc1.pdf', 'extracted', 1);

		insert into passage (id, document_id, page, ordinal, text, text_hash)
		values ('p1', 'doc1', 3, 0, 'Members may leave at any time.', 'h');
	`);
	database.close();

	// The file the passage came out of. This is the half a database-only backup
	// silently drops.
	mkdirSync(join(uploadDir, 'c1'), { recursive: true });
	writeFileSync(join(uploadDir, 'c1', 'doc1.pdf'), 'a pretend pdf');

	return { storageKey: 'c1/doc1.pdf', passage: 'Members may leave at any time.' };
}

describe('a snapshot can be restored, and the document opens', () => {
	it('takes both halves and brings both back', () => {
		const seeded = seedLiveInstance();
		const into = join(dir, 'snapshot');

		snapshot({ databaseFile, uploadDir }, into);
		expect(existsSync(join(into, DATABASE_IN_SNAPSHOT))).toBe(true);
		expect(existsSync(join(into, UPLOADS_IN_SNAPSHOT, 'c1', 'doc1.pdf'))).toBe(true);

		// Restored somewhere else entirely, the way a real one is: a new machine,
		// nothing of the original around it.
		const elsewhere = {
			databaseFile: join(dir, 'restored', 'compass.db'),
			uploadDir: join(dir, 'restored', 'uploads')
		};
		mkdirSync(join(dir, 'restored'), { recursive: true });
		restore(into, elsewhere);

		const restored = new Database(elsewhere.databaseFile, { readonly: true });
		const passage = restored
			.prepare(
				'select text, storage_key from passage join document on document.id = passage.document_id'
			)
			.get() as { text: string; storage_key: string };
		restored.close();

		// The mapped passage, and the file it was mapped from. `docs/00` §9 asks
		// for exactly this pair.
		expect(passage.text).toBe(seeded.passage);
		expect(readFileSync(join(elsewhere.uploadDir, seeded.storageKey), 'utf8')).toBe(
			'a pretend pdf'
		);
	});

	it('fails when the uploads were left out', () => {
		seedLiveInstance();
		const into = join(dir, 'half');
		snapshot({ databaseFile, uploadDir }, into);

		// The mutation that proves the drill: a snapshot of the database alone
		// restores rows and loses the documents they point at, and every row-level
		// assertion would still pass.
		rmSync(join(into, UPLOADS_IN_SNAPSHOT), { recursive: true, force: true });

		expect(() =>
			restore(into, {
				databaseFile: join(dir, 'r2', 'compass.db'),
				uploadDir: join(dir, 'r2', 'uploads')
			})
		).toThrow(RestoreRefused);
	});

	it('is taken while the instance is writing to it', () => {
		seedLiveInstance();
		const live = new Database(databaseFile);
		live.exec(
			"insert into community (id, slug, name, locale, timezone, status, publish_names_policy, ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at) values ('c2', 'fh', 'Fruit Haven', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1)"
		);

		const into = join(dir, 'live-snapshot');
		// `VACUUM INTO` rather than a file copy, which is the whole reason: copying
		// a database mid-write produces a file that opens and is wrong.
		expect(() => snapshot({ databaseFile, uploadDir }, into)).not.toThrow();
		live.close();

		const copied = new Database(join(into, DATABASE_IN_SNAPSHOT), { readonly: true });
		expect((copied.prepare('select count(*) n from community').get() as { n: number }).n).toBe(2);
		copied.close();
	});

	it('refuses to restore over a database something is holding open', () => {
		seedLiveInstance();
		const into = join(dir, 'snapshot2');
		snapshot({ databaseFile, uploadDir }, into);

		const holding = new Database(databaseFile);
		holding.exec('begin exclusive');
		try {
			expect(() => restore(into, { databaseFile, uploadDir })).toThrow(RestoreRefused);
		} finally {
			holding.exec('rollback');
			holding.close();
		}
	});

	it('removes a stale write-ahead log rather than letting it come back', () => {
		seedLiveInstance();
		const into = join(dir, 'snapshot3');
		snapshot({ databaseFile, uploadDir }, into);

		/**
		 * Restoring where there is no database yet but a `-wal` was left behind —
		 * a half-finished copy onto a new machine, which is the situation a restore
		 * is usually in. Nothing opens the target in that case, so nothing
		 * checkpoints the log away as a side effect: SQLite would simply replay it
		 * over the file we just wrote and bring back the pages the restore was
		 * meant to replace.
		 */
		const fresh = {
			databaseFile: join(dir, 'fresh', 'compass.db'),
			uploadDir: join(dir, 'fresh', 'uploads')
		};
		mkdirSync(join(dir, 'fresh'), { recursive: true });
		writeFileSync(`${fresh.databaseFile}-wal`, 'stale');

		restore(into, fresh);
		expect(existsSync(`${fresh.databaseFile}-wal`)).toBe(false);
	});

	it('is reachable as a command somebody can actually run', () => {
		// A drill nobody can run outside the suite is a drill that happens once.
		const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts as Record<
			string,
			string
		>;
		expect(scripts.snapshot).toBeTruthy();
		expect(scripts.restore).toBeTruthy();
		expect(execFileSync('node', ['--version'], { encoding: 'utf8' })).toMatch(/^v/);
	});
}, 60_000);

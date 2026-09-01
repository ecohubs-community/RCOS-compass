import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateDatabase, openDatabase, type Db } from '../../src/lib/server/db/index.js';

/**
 * A migrated database in its own temporary directory.
 *
 * docs/06-testing-strategy.md §2: one file per suite, migrated fresh, deleted
 * after — so suites run in parallel and never share state.
 */
export function createTestDb(): { db: Db; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'compass-test-'));
	const { db, close } = openDatabase(join(dir, 'test.db'));
	migrateDatabase(db);
	return {
		db,
		cleanup: () => {
			close();
			rmSync(dir, { recursive: true, force: true });
		}
	};
}

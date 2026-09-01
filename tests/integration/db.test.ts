import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	migrateDatabase,
	openDatabase,
	resolveDatabasePath
} from '../../src/lib/server/db/index.js';
import { newId, seededIdGenerator } from '../../src/lib/server/db/id.js';

describe('migrations', () => {
	it('apply to an empty database', () => {
		const dir = mkdtempSync(join(tmpdir(), 'compass-migrate-'));
		try {
			const { db, close } = openDatabase(join(dir, 'fresh.db'));
			migrateDatabase(db);
			const tables = db.all<{ name: string }>(
				sql`select name from sqlite_master where type = 'table' order by name`
			);
			expect(tables.map((t) => t.name)).toContain('job');
			close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('are a no-op on a second run', () => {
		const dir = mkdtempSync(join(tmpdir(), 'compass-migrate-'));
		try {
			const { db, close } = openDatabase(join(dir, 'twice.db'));
			migrateDatabase(db);
			expect(() => migrateDatabase(db)).not.toThrow();

			const jobTables = db.all<{ name: string }>(
				sql`select name from sqlite_master where type = 'table' and name = 'job'`
			);
			expect(jobTables).toHaveLength(1);
			close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('enables WAL and foreign keys', () => {
		const dir = mkdtempSync(join(tmpdir(), 'compass-pragma-'));
		try {
			const { db, close } = openDatabase(join(dir, 'pragma.db'));
			const [mode] = db.all<{ journal_mode: string }>(sql`pragma journal_mode`);
			const [fk] = db.all<{ foreign_keys: number }>(sql`pragma foreign_keys`);
			expect(mode?.journal_mode).toBe('wal');
			expect(fk?.foreign_keys).toBe(1);
			close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('database url', () => {
	it('strips the file: prefix and passes :memory: through', () => {
		expect(resolveDatabasePath('file:./data/compass.db')).toBe('./data/compass.db');
		expect(resolveDatabasePath(':memory:')).toBe(':memory:');
	});
});

describe('identifiers', () => {
	it('sort chronologically, so "newest first" is an index scan', async () => {
		const first = newId();
		await new Promise((resolve) => setTimeout(resolve, 2));
		const second = newId();
		expect(first < second).toBe(true);
	});

	it('are unique across a large batch', () => {
		const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
		expect(ids.size).toBe(10_000);
	});

	it('are seeded and stable in tests', () => {
		const generate = seededIdGenerator();
		expect(generate()).toBe('00000000-0000-7000-8000-000000000001');
		expect(generate()).toBe('00000000-0000-7000-8000-000000000002');
	});
});

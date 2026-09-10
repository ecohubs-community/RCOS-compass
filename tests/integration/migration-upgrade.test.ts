import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * A migration must not eat rows that were already there.
 *
 * Every other suite starts from a database migrated in one go, with nothing in
 * it — which is the one shape where this class of bug cannot appear. P6's first
 * generated migration passed every existing test and silently deleted every
 * local definition attached to a community artifact.
 *
 * The cause is worth writing down because it will recur. Adding a `CHECK` to an
 * existing table makes drizzle-kit emit SQLite's twelve-step table rebuild:
 * create a new table, copy, `DROP TABLE`, rename — wrapped in
 * `PRAGMA foreign_keys=OFF`. **That pragma is a no-op inside a transaction**,
 * and drizzle's migrator runs each migration in one, so the drop cascades to
 * every child row. It is invisible on an empty database and invisible in a
 * diff.
 *
 * So this seeds a database at the previous migration, applies the newest, and
 * asserts nothing vanished. It guards the next one as much as this one.
 */
const ROOT = join(import.meta.dirname, '../..');

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'compass-upgrade-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/**
 * A migrations folder holding everything before one of them.
 *
 * `upTo` defaults to the newest, which is what the two general guards want: seed
 * at the release before, apply the release, check nothing vanished. A test about
 * one particular migration passes that migration's tag instead — otherwise it
 * silently stops testing anything the day another migration is added, or, as
 * happened here, starts failing because its seed data no longer fits a schema
 * that has moved on.
 */
function previousMigrations(upTo?: string): { folder: string; newest: string } {
	const journal = JSON.parse(readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8')) as {
		entries: { tag: string }[];
	};
	const all = journal.entries;
	const at = upTo ? all.findIndex((entry) => entry.tag === upTo) : all.length - 1;
	if (at < 0) throw new Error(`No migration tagged ${upTo}`);

	const entries = all.slice(0, at + 1);
	const newest = entries.at(-1)!.tag;

	const folder = join(dir, `previous-${newest}`);
	mkdirSync(join(folder, 'meta'), { recursive: true });
	for (const entry of entries.slice(0, -1)) {
		cpSync(join(ROOT, 'drizzle', `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
		cpSync(
			join(ROOT, 'drizzle/meta', `${entry.tag.slice(0, 4)}_snapshot.json`),
			join(folder, 'meta', `${entry.tag.slice(0, 4)}_snapshot.json`)
		);
	}
	writeFileSync(
		join(folder, 'meta/_journal.json'),
		JSON.stringify({ ...journal, entries: entries.slice(0, -1) }, null, 2)
	);
	return { folder, newest };
}

describe('upgrading a database that already has rows in it', () => {
	it('keeps every row, and every foreign key', () => {
		const { folder, newest } = previousMigrations();
		const file = join(dir, 'upgrade.db');

		const before = new Database(file);
		before.pragma('foreign_keys = ON');
		migrate(drizzle(before), { migrationsFolder: folder });

		// A community holding one of each thing a migration could drop, including
		// the parent/child pair the cascade actually bit: a local definition
		// attached to a community artifact.
		before.exec(`
			insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
				ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
			values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1);

			insert into community_artifact (id, community_id, title, "order", kind, created_at)
			values ('a1', 'c1', 'Community Agreements', 0, 'default', 1);

			insert into definition (id, community_id, scope, attach_kind, attach_community_artifact_id,
				provisional, created_at, updated_at)
			values ('d1', 'c1', 'local', 'community_artifact', 'a1', 0, 1, 1);

			insert into document (id, community_id, filename, mime, bytes, sha256, storage_key,
				status, uploaded_at)
			values ('doc1', 'c1', 'bylaws.pdf', 'application/pdf', 10, 'x', 'k', 'extracted', 1);
		`);
		const counted = (db: Database.Database, table: string) =>
			(db.prepare(`select count(*) n from ${table}`).get() as { n: number }).n;

		const populated = ['community', 'community_artifact', 'definition', 'document'];
		const was = Object.fromEntries(populated.map((t) => [t, counted(before, t)]));
		before.close();

		// --- the migration under test -------------------------------------------
		const after = new Database(file);
		after.pragma('foreign_keys = ON');
		migrate(drizzle(after), { migrationsFolder: join(ROOT, 'drizzle') });

		for (const table of populated) {
			expect(counted(after, table), `${newest} lost rows from ${table}`).toBe(was[table]);
		}
		expect(after.pragma('foreign_key_check')).toEqual([]);
		after.close();
	});

	it('leaves every existing subject member-visible', () => {
		const { folder } = previousMigrations();
		const file = join(dir, 'defaults.db');

		const before = new Database(file);
		before.pragma('foreign_keys = ON');
		migrate(drizzle(before), { migrationsFolder: folder });
		before.exec(`
			insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
				ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
			values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1);
			insert into document (id, community_id, filename, mime, bytes, sha256, storage_key,
				status, uploaded_at)
			values ('doc1', 'c1', 'bylaws.pdf', 'application/pdf', 10, 'x', 'k', 'extracted', 1);
		`);
		before.close();

		const after = new Database(file);
		migrate(drizzle(after), { migrationsFolder: join(ROOT, 'drizzle') });

		// The upgrade must publish nothing. A community's content becoming
		// world-readable because they took a release is the failure this whole
		// phase exists to prevent.
		const row = after.prepare('select visibility, first_published_at from document').get() as {
			visibility: string;
			first_published_at: number | null;
		};
		expect(row.visibility).toBe('member');
		expect(row.first_published_at).toBeNull();
		after.close();
	});

	it('numbers every membership that was already there, oldest first', () => {
		// Pinned: this is about the migration that introduced `membership.seq`, and
		// it seeds memberships with no number. Run against "everything but the
		// newest" it would insert two rows into a schema that already numbers
		// them, and collide on the unique index rather than test anything.
		const { folder } = previousMigrations('0015_loving_thing');
		const file = join(dir, 'seq.db');

		const before = new Database(file);
		before.pragma('foreign_keys = ON');
		migrate(drizzle(before), { migrationsFolder: folder });
		before.exec(`
			insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
				ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
			values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1),
				('c2', 'fh', 'Fruit Haven', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1);

			insert into user (id, name, email, email_verified, two_factor_enabled, locale, created_at, updated_at)
			values ('u1', 'Ana', 'ana@example.org', 1, 0, 'en', 1, 1),
				('u2', 'Lena', 'lena@example.org', 1, 0, 'en', 1, 1),
				('u3', 'Bo', 'bo@example.org', 1, 0, 'en', 1, 1);

			insert into membership (id, community_id, user_id, role, is_owner, rcos_state, joined_at)
			values ('m2', 'c1', 'u2', 'member', 0, 'full', 2000),
				('m1', 'c1', 'u1', 'steward', 1, 'full', 1000),
				('m3', 'c2', 'u3', 'steward', 1, 'full', 3000);
		`);
		before.close();

		const after = new Database(file);
		after.pragma('foreign_keys = ON');
		migrate(drizzle(after), { migrationsFolder: join(ROOT, 'drizzle') });

		const numbers = after
			.prepare('select id, community_id, seq from membership order by community_id, seq')
			.all() as { id: string; community_id: string; seq: number }[];

		// Oldest member of each community is M-0001, and the numbering restarts per
		// community — the label is community-local by design, so that a person's
		// number in one community says nothing about them in another.
		expect(numbers).toEqual([
			{ id: 'm1', community_id: 'c1', seq: 1 },
			{ id: 'm2', community_id: 'c1', seq: 2 },
			{ id: 'm3', community_id: 'c2', seq: 1 }
		]);

		// The unique index exists and is enforced. Creating it before the backfill
		// would have failed here on the second membership of `c1`, which is what
		// this test is really guarding: every existing row takes the column default.
		expect(() =>
			after.exec(
				`insert into membership (id, community_id, user_id, role, is_owner, rcos_state, seq, joined_at)
				 values ('m4', 'c1', 'u3', 'member', 0, 'full', 1, 4000)`
			)
		).toThrow(/unique/i);
		after.close();
	});

	it('has a migration for every schema change', () => {
		// A schema edited without generating a migration is a deploy that works on
		// the developer's machine and nowhere else.
		const output = execFileSync('pnpm', ['exec', 'drizzle-kit', 'check'], {
			cwd: ROOT,
			encoding: 'utf8'
		});
		expect(output).not.toMatch(/error/i);
	});
}, 60_000);

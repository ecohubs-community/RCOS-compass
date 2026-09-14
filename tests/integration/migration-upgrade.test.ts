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

	it('closes rounds left open on a version a later one replaced, keeping their responses', () => {
		// Pinned: this is about the migration that added `superseded`, and it seeds
		// the orphaned round that migration exists to close. Run against "everything
		// but the newest" the seed would land *after* that migration had already
		// run, and the test would assert nothing at all.
		const { folder } = previousMigrations('0017_lumpy_makkari');
		const file = join(dir, 'orphan-round.db');

		const before = new Database(file);
		before.pragma('foreign_keys = ON');
		migrate(drizzle(before), { migrationsFolder: folder });

		// v2 with a round and a response, then v3 — the shape `openRoundFor` has
		// always left behind, because it looks a round up by the thread's latest
		// proposal and nothing ever closed the one before it.
		before.exec(`
			insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
				ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
			values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1);

			insert into user (id, name, email, email_verified, two_factor_enabled, locale, created_at, updated_at)
			values ('u1', 'Ana', 'ana@example.org', 1, 0, 'en', 1, 1);

			insert into membership (id, community_id, user_id, role, is_owner, rcos_state, joined_at, seq)
			values ('m1', 'c1', 'u1', 'member', 0, 'full', 1000, 1);

			insert into discussion (id, community_id, title, status, origin, opened_at, last_activity_at)
			values ('d1', 'c1', 'Exit and separation', 'open', 'clause', 1000, 3000);

			insert into post (id, discussion_id, author_id, body, kind, proposal_version, created_at)
			values ('p2', 'd1', 'u1', 'v2 text', 'proposal', 2, 1000),
				('p3', 'd1', 'u1', 'v3 text', 'proposal', 3, 2000);

			insert into consent_round (id, community_id, proposal_post_id, opened_by, opened_at,
				closes_at, status, eligibility)
			values ('r2', 'c1', 'p2', 'u1', 1000, 9999, 'open', 'all_members'),
				('r3', 'c1', 'p3', 'u1', 2000, 9999, 'open', 'all_members');

			insert into consent_eligible (round_id, membership_id) values ('r2', 'm1'), ('r3', 'm1');

			insert into consent_response (round_id, membership_id, value, responded_at)
			values ('r2', 'm1', 'consent', 1500);
		`);
		before.close();

		const after = new Database(file);
		after.pragma('foreign_keys = ON');
		migrate(drizzle(after), { migrationsFolder: join(ROOT, 'drizzle') });

		const rounds = after
			.prepare('select id, status, superseded_by_post_id from consent_round order by id')
			.all() as { id: string; status: string; superseded_by_post_id: string | null }[];

		expect(rounds).toEqual([
			{ id: 'r2', status: 'superseded', superseded_by_post_id: 'p3' },
			// v3 is still the text on the table, so its round is untouched.
			{ id: 'r3', status: 'open', superseded_by_post_id: null }
		]);

		// The responses v2 was given are what v2 was given. Rebuilding
		// `consent_round` drops and recreates it, and `consent_response` cascades
		// off it — the exact shape of the bug this suite exists for.
		const responses = after
			.prepare("select count(*) n from consent_response where round_id = 'r2'")
			.get() as { n: number };
		expect(responses.n, 'the table rebuild cascaded and ate the responses').toBe(1);

		const eligible = after.prepare('select count(*) n from consent_eligible').get() as {
			n: number;
		};
		expect(eligible.n).toBe(2);

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

	it('keeps every claim pointed at its passage through the passage rebuild, and unworlds documents', () => {
		// Pinned to the migration before document-paragraphs: adding
		// `passage.kind` rebuilds `passage`, and the DROP inside the migrator's
		// transaction fires ON DELETE SET NULL into `evidence.passage_id` and
		// `definition_source.passage_id` — quietly turning every claim
		// stale-shaped. The carry tables in 0019 are what this asserts.
		const { folder } = previousMigrations('0018_sturdy_harry_osborn');
		const file = join(dir, 'passages.db');

		const before = new Database(file);
		before.pragma('foreign_keys = ON');
		migrate(drizzle(before), { migrationsFolder: folder });

		before.exec(`
			insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
				ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
			values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1);

			insert into user (id, name, email, email_verified, two_factor_enabled, locale, created_at, updated_at)
			values ('u1', 'Ana', 'ana@example.org', 1, 0, 'en', 1, 1);

			insert into community_standard (id, community_id, standard_id, version, status, adopted_at)
			values ('cs1', 'c1', 'rcos-core', '0.1', 'active', 1);

			-- One document a crafted request once made world-visible: the data fix
			-- must walk it back to member.
			insert into document (id, community_id, filename, mime, bytes, sha256, storage_key,
				status, visibility, uploaded_at)
			values ('doc1', 'c1', 'bylaws.pdf', 'application/pdf', 10, 'x', 'k', 'extracted', 'world', 1);

			insert into passage (id, document_id, page, ordinal, text, text_hash)
			values ('p1', 'doc1', 1, 0, 'A member may leave at any time.', 'h1');

			insert into evidence (id, community_id, passage_id, quote, community_standard_id,
				clause_key, state, suggested_by, confirmed_by, confirmed_at, created_at)
			values ('ev1', 'c1', 'p1', 'A member may leave at any time.', 'cs1', 'ck1', 'confirmed', 'human', 'u1', 1, 1);

			insert into definition (id, community_id, scope, community_standard_id,
				section_key, provisional, created_at, updated_at)
			values ('d1', 'c1', 'standard', 'cs1', 's1', 0, 1, 1);

			insert into definition_source (definition_id, evidence_id, passage_id, created_at)
			values ('d1', 'ev1', 'p1', 1);
		`);
		before.close();

		const after = new Database(file);
		after.pragma('foreign_keys = ON');
		migrate(drizzle(after), { migrationsFolder: join(ROOT, 'drizzle') });

		const claim = after
			.prepare('select passage_id, state from evidence where id = ?')
			.get('ev1') as { passage_id: string | null; state: string };
		expect(claim, 'the rebuild cascaded and unpointed the claim').toEqual({
			passage_id: 'p1',
			state: 'confirmed'
		});

		const source = after
			.prepare('select passage_id from definition_source where definition_id = ?')
			.get('d1') as { passage_id: string | null };
		expect(source.passage_id).toBe('p1');

		const row = after.prepare('select kind from passage where id = ?').get('p1') as {
			kind: string;
		};
		expect(row.kind).toBe('paragraph');

		const doc = after.prepare('select visibility from document where id = ?').get('doc1') as {
			visibility: string;
		};
		expect(doc.visibility).toBe('member');

		// The carry tables were scaffolding, not schema.
		const leftovers = after
			.prepare("select name from sqlite_master where name like '__carry%'")
			.all();
		expect(leftovers).toEqual([]);

		expect(after.pragma('foreign_key_check')).toEqual([]);
		after.close();
	});

	it('backfills scan state and evidence documents, and a document delete still leaves claims readable', () => {
		// Pinned to the migration before document-mapping-workspace. Two things
		// this guards: the backfills, and the `ON DELETE SET NULL` drizzle-kit
		// left off the added reference columns — without it, deleting a document
		// any evidence pointed at failed instead of leaving the claim stale.
		const { folder } = previousMigrations('0020_free_moira_mactaggert');
		const file = join(dir, 'scan.db');

		const before = new Database(file);
		before.pragma('foreign_keys = ON');
		migrate(drizzle(before), { migrationsFolder: folder });

		before.exec(`
			insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
				ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
			values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 1, 0, 0, 1, 1);

			insert into community_standard (id, community_id, standard_id, version, status, adopted_at)
			values ('cs1', 'c1', 'rcos-core', '0.1', 'active', 1);

			insert into document (id, community_id, filename, mime, bytes, sha256, storage_key,
				status, uploaded_at)
			values ('scanned', 'c1', 'bylaws.pdf', 'application/pdf', 10, 'x', 'k1', 'extracted', 1),
				('unscanned', 'c1', 'minutes.pdf', 'application/pdf', 10, 'y', 'k2', 'extracted', 1);

			insert into passage (id, document_id, page, ordinal, text, text_hash)
			values ('p1', 'scanned', 1, 0, 'A member may leave at any time.', 'h1'),
				('p2', 'scanned', 1, 1, 'Nothing here.', 'h2'),
				('p3', 'unscanned', 1, 0, 'Quiet hours start at ten.', 'h3');

			insert into evidence (id, community_id, passage_id, quote, community_standard_id,
				clause_key, state, suggested_by, created_at)
			values ('ev1', 'c1', 'p1', 'A member may leave at any time.', 'cs1', 'ck1', 'suggested', 'ai', 5);
		`);
		before.close();

		const after = new Database(file);
		after.pragma('foreign_keys = ON');
		migrate(drizzle(after), { migrationsFolder: join(ROOT, 'drizzle') });

		const docs = after
			.prepare('select id, scan_status, scan_detail, content_generation from document order by id')
			.all() as { id: string; scan_status: string; scan_detail: string | null }[];
		expect(docs[0]).toMatchObject({ id: 'scanned', scan_status: 'stopped', content_generation: 0 });
		expect(docs[0]!.scan_detail).toMatch(/before Compass recorded progress/);
		expect(docs[1]).toMatchObject({ id: 'unscanned', scan_status: 'none', scan_detail: null });

		// Only the passage a model actually suggested for counts as read.
		const read = after.prepare('select id, scanned_at from passage order by id').all() as {
			id: string;
			scanned_at: number | null;
		}[];
		expect(read).toEqual([
			{ id: 'p1', scanned_at: 5 },
			{ id: 'p2', scanned_at: null },
			{ id: 'p3', scanned_at: null }
		]);

		const claim = after.prepare('select document_id from evidence where id = ?').get('ev1') as {
			document_id: string;
		};
		expect(claim.document_id).toBe('scanned');

		// The trigger refuses a scan state no screen renders.
		expect(() =>
			after.exec(`update document set scan_status = 'paused' where id = 'unscanned'`)
		).toThrow(/scan_status must be/);

		// And the reference acts as set-null: the document can go, the claim stays.
		after.exec(`delete from passage where document_id = 'scanned'`);
		after.exec(`delete from document where id = 'scanned'`);
		const kept = after
			.prepare('select document_id, passage_id from evidence where id = ?')
			.get('ev1');
		expect(kept).toEqual({ document_id: null, passage_id: null });

		expect(after.pragma('foreign_key_check')).toEqual([]);
		after.close();
	});

	it('gives every membership email on and a Monday digest, and retires the weekly digest job', () => {
		const { folder } = previousMigrations('0023_stormy_susan_delgado');
		const file = join(dir, 'notifications.db');

		const before = new Database(file);
		before.pragma('foreign_keys = ON');
		migrate(drizzle(before), { migrationsFolder: folder });
		before.exec(`
			insert into community (id, slug, name, locale, timezone, status, publish_names_policy,
				ai_enabled, git_mirror_enabled, public_index_enabled, created_at, updated_at)
			values ('c1', 'vv', 'Valle Verde', 'en', 'UTC', 'active', 'roles_and_counts', 0, 0, 0, 1, 1);

			insert into user (id, name, email, email_verified, created_at, updated_at)
			values ('u1', 'Ana', 'ana@example.org', 1, 1, 1);

			insert into membership (id, community_id, user_id, role, is_owner, rcos_state, joined_at, seq)
			values ('m1', 'c1', 'u1', 'member', 0, 'full', 1000, 1);

			insert into notification (id, community_id, recipient_membership_id, kind, subject_type,
				subject_id, summary, created_at)
			values ('n1', 'c1', 'm1', 'decision.frozen', 'decision', 'd1', 'Spending authority', 1);

			insert into job (id, kind, payload, status, run_after, created_at, updated_at)
			values ('j1', 'weekly-digest', '{}', 'pending', 9, 1, 1),
				('j2', 'prune-rate-limits', '{}', 'pending', 9, 1, 1);
		`);
		before.close();

		const after = new Database(file);
		after.pragma('foreign_keys = ON');
		migrate(drizzle(after), { migrationsFolder: join(ROOT, 'drizzle') });

		expect(
			after.prepare('select email_enabled, digest_day, last_digest_at from membership').get()
		).toEqual({ email_enabled: 1, digest_day: 1, last_digest_at: null });
		expect(after.prepare('select params, summary from notification').get()).toEqual({
			params: null,
			summary: 'Spending authority'
		});
		expect(after.prepare('select claim_compliant from community').get()).toEqual({
			claim_compliant: null
		});
		expect(after.prepare('select kind from job order by kind').all()).toEqual([
			{ kind: 'prune-rate-limits' }
		]);
		expect(after.pragma('foreign_key_check')).toEqual([]);
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

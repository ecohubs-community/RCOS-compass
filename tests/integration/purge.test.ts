import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { community } from '../../src/lib/server/db/schema/tenancy.js';
import { document } from '../../src/lib/server/db/schema/documents.js';
import { absolutePathOf, receiveUpload } from '../../src/lib/server/documents/storage.js';
import { purgeDeletedCommunities } from '../../src/lib/server/jobs/purge.js';
import { DELETE_GRACE_MS, deleteTenant } from '../../src/lib/server/services/admin/communities.js';
import { createDocument } from '../../src/lib/server/services/documents.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * What "deleted" has to mean once the grace period has passed.
 *
 * A community that asked to leave and finds its bylaws still sitting on
 * somebody's volume has not left. A database cascade cannot do that part, so
 * the job does — and the failure worth designing against is the crash between
 * the two halves, which leaves a directory nothing references rather than a
 * community whose files went missing while it still existed.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const FIXTURES = join(import.meta.dirname, '../fixtures/documents');

let db: Db;
let cleanup: () => void;
let uploadDir: string;
let ctx: Ctx;
let admin: { userId: string; email: string; ip: string };

beforeEach(async () => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	uploadDir = mkdtempSync(join(tmpdir(), 'compass-purge-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	resetConfigForTests();

	const place = makeCommunity(db, { slug: 'valle-verde' });
	const person = makeUser(db, { email: 'ana@example.org' });
	// A real row: the audit entry deletion writes has a foreign key on the actor.
	const operator = makeUser(db, { email: 'ops@example.org' });
	admin = { userId: operator.id, email: operator.email, ip: '127.0.0.1' };
	ctx = {
		user: person,
		community: place,
		membership: makeMembership(db, place.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};

	const file = new File([readFileSync(join(FIXTURES, 'valle-verde-bylaws.pdf'))], 'bylaws.pdf');
	await createDocument(
		ctx,
		{ filename: 'bylaws.pdf', file: await receiveUpload(file, place.id) },
		{ db }
	);
});

afterEach(() => {
	setDbForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	rmSync(uploadDir, { recursive: true, force: true });
	cleanup();
});

const storageKey = () => db.select().from(document).all()[0]!.storageKey;

describe('a deleted community takes its documents with it', () => {
	it('keeps everything during the grace period', async () => {
		const key = storageKey();
		deleteTenant(db, fixedClock(NOW), admin, ctx.community.id, 'asked to leave');

		// Recoverable for thirty days, which means the files have to still be here.
		const result = await purgeDeletedCommunities(db, fixedClock(NOW + 1000));

		expect(result.purged).toBe(0);
		expect(db.select().from(community).all()).toHaveLength(1);
		expect(existsSync(absolutePathOf(key))).toBe(true);
	});

	it('removes the rows and the upload directory once the grace period passes', async () => {
		const key = storageKey();
		deleteTenant(db, fixedClock(NOW), admin, ctx.community.id, 'asked to leave');

		const after = fixedClock(NOW + DELETE_GRACE_MS + 1000);
		const result = await purgeDeletedCommunities(db, after);

		expect(result.purged).toBe(1);
		expect(db.select().from(community).all()).toHaveLength(0);
		// The cascade took the documents; the job took the files.
		expect(db.select().from(document).all()).toHaveLength(0);
		expect(existsSync(join(uploadDir, ctx.community.id))).toBe(false);
		expect(existsSync(absolutePathOf(key))).toBe(false);
	});

	it('leaves an active community entirely alone', async () => {
		const key = storageKey();
		const result = await purgeDeletedCommunities(db, fixedClock(NOW + DELETE_GRACE_MS * 2));

		expect(result.purged).toBe(0);
		expect(existsSync(absolutePathOf(key))).toBe(true);
	});
});

describe('a document whose file has gone', () => {
	it('is a 404 rather than a download that fails halfway', async () => {
		// The state the orphan sweep exists for, seen from the reader's side. The
		// route used to wrap `createReadStream` in a try/catch, which catches
		// nothing — the stream reports a missing file as an event — so this
		// answered 200 with a body that errored mid-download.
		const { GET } = await import('../../src/routes/(app)/c/[slug]/documents/[id]/file/+server.js');
		const documentId = db.select().from(document).all()[0]!.id;
		rmSync(join(uploadDir, ctx.community.id), { recursive: true, force: true });

		let status = 0;
		try {
			await GET({ locals: { ctx }, params: { id: documentId } } as never);
		} catch (problem) {
			status = (problem as { status?: number }).status ?? 0;
		}
		expect(status).toBe(404);
	});
});

describe('the crash between the two halves heals itself', () => {
	it('removes a directory belonging to no community', async () => {
		// Exactly what a process dying between the row delete and the file delete
		// leaves behind — and what any older bug that forgot the files left too.
		const orphan = join(uploadDir, 'a-community-that-no-longer-exists');
		mkdirSync(orphan, { recursive: true });
		writeFileSync(join(orphan, 'bylaws.pdf'), 'their governance');

		const result = await purgeDeletedCommunities(db, fixedClock(NOW));

		expect(result.orphansRemoved).toBe(1);
		expect(existsSync(orphan)).toBe(false);
	});

	it('does not touch a live community-s directory, or the incoming staging area', async () => {
		const incoming = join(uploadDir, '.incoming');
		mkdirSync(incoming, { recursive: true });
		writeFileSync(join(incoming, 'half-written'), 'x');

		const result = await purgeDeletedCommunities(db, fixedClock(NOW));

		expect(result.orphansRemoved).toBe(0);
		expect(existsSync(incoming)).toBe(true);
		expect(existsSync(join(uploadDir, ctx.community.id))).toBe(true);
	});
});

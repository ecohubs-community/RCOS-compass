import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { anonymousIn } from '../../src/lib/server/auth/audience.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	document,
	documentFileVersion,
	evidence
} from '../../src/lib/server/db/schema/documents.js';
import { job } from '../../src/lib/server/db/schema/jobs.js';
import { serveStoredFile } from '../../src/lib/server/documents/serve-file.js';
import { absolutePathOf, receiveUpload } from '../../src/lib/server/documents/storage.js';
import { ORPHAN_FILE_GRACE_MS, purgeDeletedCommunities } from '../../src/lib/server/jobs/purge.js';
import {
	deleteVersion,
	getVersion,
	listVersions,
	replaceDocument,
	restoreVersion
} from '../../src/lib/server/services/document-versions.js';
import { createDocument, deleteDocument } from '../../src/lib/server/services/documents.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { createTestDb } from '../support/db.js';
import { adoptStandard, makeEvidence, makePassage } from '../support/documents.js';
import { catchRefusalAsync, catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Replacing a document's file without losing the file it replaced. The change's
 * `documents` spec: replace, restore, and who may delete what for good.
 */
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let uploadDir: string;
let ana: Ctx;
let lena: Ctx;
let standardId: string;

const text = (name: string, body: string) => new File([body], name);

async function upload(ctx: Ctx, name: string, body: string) {
	return createDocument(
		ctx,
		{ filename: name, file: await receiveUpload(text(name, body), ctx.community.id) },
		{ db }
	);
}

async function replace(ctx: Ctx, documentId: string, name: string, body: string) {
	return replaceDocument(
		ctx,
		documentId,
		{ filename: name, file: await receiveUpload(text(name, body), ctx.community.id) },
		{ db }
	);
}

const docRow = (id: string) => db.select().from(document).where(eq(document.id, id)).get()!;
const versionsOf = (id: string) =>
	db.select().from(documentFileVersion).where(eq(documentFileVersion.documentId, id)).all();

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	uploadDir = mkdtempSync(join(tmpdir(), 'compass-versions-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	resetConfigForTests();

	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardId = adoptStandard(db, home.id);
	const steward = makeUser(db, { email: 'ana@example.org', name: 'Ana' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
	const member = makeUser(db, { email: 'lena@example.org', name: 'Lena' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, home.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	rmSync(uploadDir, { recursive: true, force: true });
	cleanup();
});

describe('replacing a file', () => {
	it('keeps the document, keeps the old file as a version, and starts a new reading', async () => {
		const doc = await upload(ana, 'bylaws-2019.md', 'A member may leave at any time.');
		const at = makePassage(db, doc.id, { text: 'A member may leave at any time.' });
		const claim = makeEvidence(db, {
			communityId: ana.community.id,
			communityStandardId: standardId,
			passage: at,
			state: 'confirmed',
			suggestedBy: 'human',
			confirmedBy: ana.user.id
		});

		// Any member may replace; keeping the old file is what makes that safe.
		await replace(lena, doc.id, 'bylaws-2024.md', 'A member may leave with a month of notice.');

		const after = docRow(doc.id);
		expect(after).toMatchObject({
			id: doc.id,
			filename: 'bylaws-2024.md',
			status: 'uploaded',
			uploadedBy: lena.user.id,
			contentGeneration: doc.contentGeneration + 1,
			scanStatus: 'none'
		});
		expect(versionsOf(doc.id)).toEqual([
			expect.objectContaining({
				filename: 'bylaws-2019.md',
				storageKey: doc.storageKey,
				uploadedBy: ana.user.id,
				supersededBy: lena.user.id
			})
		]);
		// Both files are on disk: the new one current, the old one kept.
		expect(existsSync(absolutePathOf(after.storageKey))).toBe(true);
		expect(existsSync(absolutePathOf(doc.storageKey))).toBe(true);
		// The claim went stale rather than away, and a reading is queued.
		expect(db.select().from(evidence).where(eq(evidence.id, claim.id)).get()!.state).toBe('stale');
		expect(
			db
				.select()
				.from(job)
				.all()
				.filter((row) => row.kind === 'extract-document')
		).toHaveLength(2);
	});

	it('refuses the same file again, and changes nothing', async () => {
		const doc = await upload(ana, 'bylaws.md', 'The same words.');

		const refusal = await catchRefusalAsync(() =>
			replace(ana, doc.id, 'again.md', 'The same words.')
		);
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/same file/);
		expect(versionsOf(doc.id)).toHaveLength(0);
		expect(docRow(doc.id).filename).toBe('bylaws.md');
	});

	it('counts kept versions toward the storage ceiling, and refuses without changing anything', async () => {
		vi.stubEnv('STORAGE_MB', '1');
		resetConfigForTests();
		const doc = await upload(ana, 'bylaws.md', 'x'.repeat(400_000));
		await replace(ana, doc.id, 'bylaws-2.md', 'y'.repeat(400_000));

		// 800 KB stored between the current file and its version; 400 KB more is over.
		const refusal = await catchRefusalAsync(() =>
			replace(ana, doc.id, 'bylaws-3.md', 'z'.repeat(400_000))
		);
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/earlier versions/);
		expect(docRow(doc.id).filename).toBe('bylaws-2.md');
		expect(versionsOf(doc.id)).toHaveLength(1);
	});

	it('counts each uploaded file once against the hourly limit', async () => {
		vi.stubEnv('UPLOAD_PER_USER_HOUR', '2');
		resetConfigForTests();
		const doc = await upload(ana, 'one.md', 'First.');
		await replace(ana, doc.id, 'two.md', 'Second.');

		const refusal = await catchRefusalAsync(() => replace(ana, doc.id, 'three.md', 'Third.'));
		expect(refusal?.message).toMatch(/in the last hour/);
	});

	it('answers for another community-s document as if it does not exist', async () => {
		const doc = await upload(ana, 'bylaws.md', 'Ours.');
		const elsewhere = makeCommunity(db, { slug: 'elsewhere' });
		const marco = makeUser(db, { email: 'marco@example.org' });
		const theirs: Ctx = {
			user: marco,
			community: elsewhere,
			membership: makeMembership(db, elsewhere.id, marco.id, { role: 'steward', isOwner: true }),
			now: () => NOW
		};

		expect(
			(await catchRefusalAsync(() => replace(theirs, doc.id, 'x.md', 'Theirs.')))?.status
		).toBe(404);
		expect(docRow(doc.id).filename).toBe('bylaws.md');
	});
});

describe('restoring and deleting versions', () => {
	it('restores an earlier file without copying bytes, and starts a new reading', async () => {
		const doc = await upload(ana, 'bylaws-2019.md', 'The original words.');
		await replace(lena, doc.id, 'mistake.md', 'Something else entirely.');
		const [version] = versionsOf(doc.id);
		const mistakeKey = docRow(doc.id).storageKey;
		const totalBefore = docRow(doc.id).bytes + version!.bytes;

		restoreVersion(lena, doc.id, version!.id, { db });

		const after = docRow(doc.id);
		expect(after).toMatchObject({
			filename: 'bylaws-2019.md',
			storageKey: doc.storageKey,
			uploadedBy: ana.user.id,
			status: 'uploaded'
		});
		const now = versionsOf(doc.id);
		expect(now).toHaveLength(1);
		expect(now[0]).toMatchObject({ filename: 'mistake.md', storageKey: mistakeKey });
		expect(after.bytes + now[0]!.bytes).toBe(totalBefore);
	});

	it('lets a steward delete a version for good, and refuses a member', async () => {
		const doc = await upload(ana, 'one.md', 'First.');
		await replace(ana, doc.id, 'two.md', 'Second.');
		const [version] = versionsOf(doc.id);

		expect(
			(await catchRefusalAsync(() => deleteVersion(lena, doc.id, version!.id, { db })))?.status
		).toBe(403);
		expect(existsSync(absolutePathOf(version!.storageKey))).toBe(true);

		await deleteVersion(ana, doc.id, version!.id, { db });
		expect(versionsOf(doc.id)).toHaveLength(0);
		expect(existsSync(absolutePathOf(version!.storageKey))).toBe(false);
		expect(existsSync(absolutePathOf(docRow(doc.id).storageKey))).toBe(true);
	});

	it('removes every version file with the document', async () => {
		const doc = await upload(ana, 'one.md', 'First.');
		await replace(ana, doc.id, 'two.md', 'Second.');
		await replace(ana, doc.id, 'three.md', 'Third.');
		const keys = [docRow(doc.id).storageKey, ...versionsOf(doc.id).map((row) => row.storageKey)];
		expect(keys).toHaveLength(3);

		await deleteDocument(ana, doc.id, { db });

		expect(versionsOf(doc.id)).toHaveLength(0);
		for (const key of keys) expect(existsSync(absolutePathOf(key))).toBe(false);
	});

	it('shows a version only to someone who may see its document', async () => {
		const doc = await upload(ana, 'one.md', 'First.');
		await replace(ana, doc.id, 'two.md', 'Second.');
		const [version] = versionsOf(doc.id);

		expect(listVersions(lena, doc.id, { db })).toHaveLength(1);
		expect(
			catchRefusal(() => getVersion(anonymousIn(ana.community.id), doc.id, version!.id, { db }))
				?.status
		).toBe(404);
	});

	it('serves a version as an attachment that is never sniffed', async () => {
		const doc = await upload(ana, 'one.md', '# Heading\n\n<script>alert(1)</script>');
		await replace(ana, doc.id, 'two.md', 'Second.');
		const [version] = versionsOf(doc.id);

		const response = await serveStoredFile(version!);
		expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/);
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});
});

describe('the orphan sweep', () => {
	it('removes an old unreferenced file, and leaves fresh, referenced and exported ones', async () => {
		const doc = await upload(ana, 'kept.md', 'Referenced.');
		const dir = join(uploadDir, ana.community.id);
		const orphan = join(dir, 'left-behind-by-a-crash');
		const fresh = join(dir, 'moved-into-place-a-moment-ago');
		writeFileSync(orphan, 'nobody points here');
		writeFileSync(fresh, 'a replacement mid-flight');
		mkdirSync(join(dir, 'exports'), { recursive: true });
		writeFileSync(join(dir, 'exports', 'bundle.zip'), 'an export');
		const old = (NOW - ORPHAN_FILE_GRACE_MS - 60_000) / 1000;
		utimesSync(orphan, old, old);

		const result = await purgeDeletedCommunities(db, fixedClock(NOW));

		expect(result.orphansRemoved).toBe(1);
		expect(existsSync(orphan)).toBe(false);
		expect(existsSync(fresh)).toBe(true);
		expect(existsSync(join(dir, 'exports', 'bundle.zip'))).toBe(true);
		expect(existsSync(absolutePathOf(doc.storageKey))).toBe(true);
	});
});

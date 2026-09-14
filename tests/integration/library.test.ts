import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { documentFileVersion } from '../../src/lib/server/db/schema/documents.js';
import { newId } from '../../src/lib/server/db/id.js';
import { kindOf, libraryView, versionsWithPeople } from '../../src/lib/server/services/library.js';
import { createTestDb } from '../support/db.js';
import { adoptStandard, makeDocument, makeEvidence, makePassage } from '../support/documents.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The library's rows and counts: which filter a document falls under, what its
 * row says, and whose name is on it.
 */
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let standardId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardId = adoptStandard(db, home.id);
	const steward = makeUser(db, { email: 'ana@example.org', name: 'Ana Ruiz' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const claim = (documentId: string, state: 'suggested' | 'confirmed') =>
	makeEvidence(db, {
		communityId: ana.community.id,
		communityStandardId: standardId,
		passage: makePassage(db, documentId),
		state,
		confirmedBy: ana.user.id
	});

describe('the library view', () => {
	it('sorts documents into the filters by their mapping state', () => {
		const waiting = makeDocument(db, ana.community.id, { filename: 'waiting.pdf' });
		makePassage(db, waiting.id);
		const started = makeDocument(db, ana.community.id, {
			filename: 'started.pdf',
			scanStatus: 'complete'
		});
		claim(started.id, 'suggested');
		makeDocument(db, ana.community.id, {
			filename: 'reading.pdf',
			status: 'uploaded'
		});

		const all = libraryView(ana, 'all', { db });
		expect(all.counts).toEqual({ all: 3, not_mapped: 1, mapped: 1 });
		expect(Object.fromEntries(all.rows.map((row) => [row.filename, row.state]))).toEqual({
			'waiting.pdf': 'not_scanned',
			'started.pdf': 'in_progress',
			'reading.pdf': 'reading'
		});

		expect(libraryView(ana, 'not_mapped', { db }).rows.map((row) => row.id)).toEqual([waiting.id]);
		expect(libraryView(ana, 'mapped', { db }).rows.map((row) => row.id)).toEqual([started.id]);
		// The counts are the whole library's, whichever filter is showing.
		expect(libraryView(ana, 'mapped', { db }).counts).toEqual(all.counts);
	});

	it('names the uploader, and says a by-hand mapping was by hand', () => {
		const doc = makeDocument(db, ana.community.id, { uploadedBy: ana.user.id });
		claim(doc.id, 'confirmed');

		const [row] = libraryView(ana, 'all', { db }).rows;
		expect(row).toMatchObject({
			uploader: 'Ana Ruiz',
			kind: 'PDF',
			pages: 1,
			byHandOnly: true
		});
		expect(row!.counts).toMatchObject({ identified: 1, open: 0, confirmedClaims: 1 });
	});

	it('shows nothing of another community', () => {
		const other = makeCommunity(db, { slug: 'elsewhere' });
		makeDocument(db, other.id);

		expect(libraryView(ana, 'all', { db })).toMatchObject({
			rows: [],
			counts: { all: 0, not_mapped: 0, mapped: 0 }
		});
	});

	it('labels kinds, not extensions', () => {
		expect(kindOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(
			'DOC'
		);
		expect(kindOf('text/markdown')).toBe('MD');
		expect(kindOf('image/png')).toBe('FILE');
	});
});

describe('versions with people', () => {
	it('names who uploaded and who replaced each earlier file', () => {
		const lena = makeUser(db, { name: 'Lena Berg' });
		makeMembership(db, ana.community.id, lena.id, { role: 'member' });
		const doc = makeDocument(db, ana.community.id, { uploadedBy: ana.user.id });
		db.insert(documentFileVersion)
			.values({
				id: newId(),
				documentId: doc.id,
				communityId: ana.community.id,
				filename: 'bylaws-2018.pdf',
				mime: 'application/pdf',
				bytes: 900,
				sha256: 'earlier',
				storageKey: `${ana.community.id}/earlier.pdf`,
				uploadedBy: lena.id,
				uploadedAt: new Date(NOW - 86_400_000),
				supersededBy: ana.user.id,
				supersededAt: new Date(NOW)
			})
			.run();

		expect(versionsWithPeople(ana, doc.id, { db })).toEqual([
			expect.objectContaining({
				filename: 'bylaws-2018.pdf',
				uploader: 'Lena Berg',
				supersededBy: 'Ana Ruiz'
			})
		]);
	});
});

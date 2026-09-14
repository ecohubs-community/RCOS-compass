import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { document } from '../../src/lib/server/db/schema/documents.js';
import { community } from '../../src/lib/server/db/schema/tenancy.js';
import {
	markMappingDone,
	mappingInputFor,
	reopenMapping
} from '../../src/lib/server/services/documents.js';
import { documentCounts, libraryCounts } from '../../src/lib/server/services/mapping-counts.js';
import { mappingStateOf } from '../../src/lib/server/services/mapping-state.js';
import { createTestDb } from '../support/db.js';
import { adoptStandard, makeDocument, makeEvidence, makePassage } from '../support/documents.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The numbers behind a document's state, from real rows — and the one act a
 * member takes on the state directly.
 */
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let standardId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardId = adoptStandard(db, home.id);
	const steward = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
	const member = makeUser(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, home.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const claim = (
	doc: { id: string },
	state: 'suggested' | 'confirmed' | 'dismissed' | 'stale',
	overrides: { kind?: 'heading' | 'paragraph'; page?: number } = {}
) =>
	makeEvidence(db, {
		communityId: ana.community.id,
		communityStandardId: standardId,
		passage: makePassage(db, doc.id, overrides),
		state,
		suggestedBy: state === 'confirmed' ? 'human' : 'ai',
		confirmedBy: ana.user.id
	});

describe('what is counted', () => {
	it('counts identified and open paragraphs, and the pages they are on', () => {
		const doc = makeDocument(db, ana.community.id);
		claim(doc, 'suggested', { page: 1 });
		claim(doc, 'confirmed', { page: 2 });
		claim(doc, 'dismissed', { page: 2 });
		makePassage(db, doc.id, { page: 3 });

		expect(documentCounts(ana, doc.id, { db })).toMatchObject({
			paragraphs: 4,
			identified: 3,
			open: 1,
			governancePages: 2
		});
	});

	it('does not count stale evidence or headings', () => {
		const doc = makeDocument(db, ana.community.id);
		claim(doc, 'stale');
		claim(doc, 'suggested', { kind: 'heading' });

		expect(documentCounts(ana, doc.id, { db })).toMatchObject({
			paragraphs: 1,
			identified: 0,
			open: 0
		});
	});

	it('counts nothing of another community', () => {
		const other = makeCommunity(db, { slug: 'elsewhere' });
		const otherStandard = adoptStandard(db, other.id);
		const theirs = makeDocument(db, other.id);
		makeEvidence(db, {
			communityId: other.id,
			communityStandardId: otherStandard,
			passage: makePassage(db, theirs.id),
			state: 'suggested'
		});

		expect([...libraryCounts(ana, { db }).keys()]).toEqual([]);
		expect(documentCounts(ana, theirs.id, { db })).toBeNull();
	});

	it('leaves a restricted document out of the counts of a member who may not see it', () => {
		const hidden = makeDocument(db, ana.community.id, { visibility: 'restricted' });
		claim(hidden, 'suggested');

		expect(libraryCounts(lena, { db }).has(hidden.id)).toBe(false);
		expect(libraryCounts(ana, { db }).has(hidden.id)).toBe(true);
	});
});

describe('marking mapping as done', () => {
	const stateOf = (id: string) => {
		const found = db.select().from(document).where(eq(document.id, id)).get()!;
		return mappingStateOf(mappingInputFor(ana, found, NOW, { db })).state;
	};

	it('turns a hand-mapped document from in progress to mapped', () => {
		const doc = makeDocument(db, ana.community.id);
		claim(doc, 'confirmed');
		expect(stateOf(doc.id)).toBe('in_progress');

		markMappingDone(lena, doc.id, { db });
		expect(stateOf(doc.id)).toBe('mapped');

		reopenMapping(lena, doc.id, { db });
		expect(stateOf(doc.id)).toBe('in_progress');
	});

	it('is refused while a suggestion is still open', () => {
		const doc = makeDocument(db, ana.community.id);
		claim(doc, 'suggested');

		expect(catchRefusal(() => markMappingDone(ana, doc.id, { db }))?.status).toBe(409);
		expect(stateOf(doc.id)).toBe('in_progress');
	});

	it('is refused while a scan is live', () => {
		const doc = makeDocument(db, ana.community.id, {
			scanStatus: 'running',
			scanHeartbeatAt: new Date(NOW - 1000)
		});
		claim(doc, 'confirmed');

		expect(catchRefusal(() => markMappingDone(ana, doc.id, { db }))?.status).toBe(409);
	});

	it('is refused while the community is suspended', () => {
		const doc = makeDocument(db, ana.community.id);
		claim(doc, 'confirmed');
		db.update(community)
			.set({ status: 'suspended' })
			.where(eq(community.id, ana.community.id))
			.run();
		const suspended = { ...ana, community: { ...ana.community, status: 'suspended' as const } };

		expect(
			catchRefusal(() => markMappingDone(suspended, doc.id, { db }))?.status
		).toBeGreaterThanOrEqual(400);
	});
});

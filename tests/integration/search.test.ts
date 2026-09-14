import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { decision } from '../../src/lib/server/db/schema/decisions.js';
import { document, passage } from '../../src/lib/server/db/schema/documents.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { getSearchIndex, setSearchIndexForTests } from '../../src/lib/server/search/index.js';
import type { SearchHit } from '../../src/lib/server/search/types.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { restrict } from '../../src/lib/server/services/visibility.js';
import { definition as definitionTable } from '../../src/lib/server/db/schema/definitions.js';
import { asSignedIn } from '../../src/lib/server/auth/audience.js';
import { visibleLevels } from '../../src/lib/server/auth/visible-to.js';
import { makeMembership as makeSeat, makeUser as makePerson } from '../support/factories.js';
import { deleteDocument } from '../../src/lib/server/services/documents.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import {
	indexDocument,
	rebuildSearchIndex,
	removeDocumentFromIndex
} from '../../src/lib/server/services/search.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * What a community can find, and what it cannot.
 *
 * The exit criterion this phase is built around is a member typing *"can we
 * spend €800 on the water pump?"* and getting back the rules that govern it —
 * from their own community and no other. These are the properties that has to
 * rest on: the tenant boundary is inside the query, the index says what the
 * rows say, and what a community stopped saying stops being findable.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

const SPENDING = 'Any spend over €500 needs a consent decision of the whole circle.';
/** A word nothing else in the fixture uses, so a hit is unambiguous. */
const SECRET_WORDS = 'The quetzal fund needs a consent decision before any spending.';

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let bo: Ctx;
/** A plain member of Ana's community: the reader a restriction hides from. */
let lena: Ctx;

function seed(slug: string): Ctx {
	const home = makeCommunity(db, { slug });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const person = makeUser(db, { email: `steward-${slug}@example.org` });
	const seat = makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true });
	return { user: person, community: home, membership: seat, now: () => NOW } as Ctx;
}

let keys = 0;
function decide(who: Ctx, title: string, body: string) {
	const thread = openDiscussion(
		who,
		{ title, about: { kind: 'clause', clauseKey: COUNTABLE.key } },
		{ db }
	);
	addProposal(who, { discussionId: thread.id, body }, { db });
	return freeze(
		who,
		{
			discussionId: thread.id,
			idempotencyKey: `key-${(keys += 1)}`,
			title,
			type: 'strategic',
			mechanism: 'consent'
		} as Parameters<typeof freeze>[1],
		{ db }
	);
}

const find = (who: Ctx, text: string): SearchHit[] =>
	getSearchIndex(db).query(who.community.id, text, { levels: visibleLevels(asSignedIn(who)) });
const refs = (hits: SearchHit[]) => hits.map((hit) => `${hit.kind}:${hit.subjectId}`).sort();

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ana = seed('valle-verde');
	bo = seed('other-place');

	const member = makePerson(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeSeat(db, ana.community.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('the community is inside the query', () => {
	it('shows one community nothing of another, given the same words', () => {
		// The same sentence, decided independently by two communities. Nothing
		// distinguishes the rows but the tenant, which is the point.
		decide(ana, 'Spending authority', SPENDING);
		decide(bo, 'Spending authority', SPENDING);

		const mine = find(ana, 'spend water pump €800');
		const theirs = find(bo, 'spend water pump €800');

		expect(mine.length).toBeGreaterThan(0);
		expect(mine.length).toBe(theirs.length);
		// Identical text, disjoint rows. Nothing one community can type reaches
		// the other's, because the tenant is in the query rather than applied to
		// the results afterwards.
		const ours = new Set(mine.map((hit) => hit.subjectId));
		expect(theirs.some((hit) => ours.has(hit.subjectId))).toBe(false);
	});

	it('finds nothing at all for a community that has written nothing', () => {
		decide(ana, 'Spending authority', SPENDING);
		expect(find(bo, 'spending')).toEqual([]);
	});
});

describe('what the index answers', () => {
	it('answers the water-pump question from the text the community adopted', () => {
		// Not from the title: "Spending authority" contains none of these words.
		const recorded = decide(ana, 'Spending authority', SPENDING);

		const hits = find(ana, 'Can we spend €800 on the water pump?');
		expect(hits.map((hit) => hit.subjectId)).toContain(recorded.id);
	});

	it('ranks a decision whose title matches above one that only mentions it', () => {
		decide(ana, 'Quiet hours', 'Nobody may run the water pump after 22:00.');
		const named = decide(ana, 'Water pump', 'The circle maintains shared equipment.');

		// Decisions only: each `decide` also opens a thread of the same name, and
		// a two-word title with no body outranks everything by construction.
		const hits = getSearchIndex(db).query(ana.community.id, 'water pump', {
			kinds: ['decision'],
			levels: visibleLevels(asSignedIn(ana))
		});
		expect(hits).toHaveLength(2);
		expect(hits[0]!.subjectId).toBe(named.id);
	});

	it('says nothing rather than something wrong when no word is worth looking for', () => {
		decide(ana, 'Spending authority', SPENDING);
		// All stop words. An empty MATCH is a syntax error in FTS5, and the honest
		// answer to "search for nothing" is nothing.
		expect(find(ana, 'the and of it')).toEqual([]);
	});

	it('treats a member’s punctuation as words, not as query syntax', () => {
		decide(ana, 'Spending authority', SPENDING);
		// Every one of these is an operator or a syntax error in FTS5's expression
		// language. A member typing them gets a search, not a stack trace.
		for (const question of ['spend AND NOT pump', 'spend*', '"unclosed', 'spend OR (', 'NEAR/']) {
			expect(() => find(ana, question)).not.toThrow();
		}
	});
});

describe('what a community stopped saying', () => {
	it('finds a superseded definition by its current text and not its replaced text', () => {
		decide(ana, 'Spending authority', 'Any spend over €500 needs a consent decision.');
		decide(ana, 'Spending authority, revised', 'Any purchase over €2000 needs a consent decision.');

		const definitions = find(ana, 'consent decision').filter((hit) => hit.kind === 'definition');
		expect(definitions).toHaveLength(1);
		expect(definitions[0]!.body).toContain('€2000');

		// The old wording is gone from the definition. The *decision* that adopted
		// it stays findable, because the register is append-only and a superseded
		// decision still says what was true then.
		expect(find(ana, '500').filter((hit) => hit.kind === 'definition')).toEqual([]);
		expect(find(ana, '500').filter((hit) => hit.kind === 'decision')).toHaveLength(1);
	});

	it('makes a destroyed document’s passages unfindable', async () => {
		const id = newId();
		db.insert(document)
			.values({
				id,
				communityId: ana.community.id,
				filename: 'bylaws-2019.pdf',
				mime: 'application/pdf',
				bytes: 100,
				sha256: 'x'.repeat(64),
				storageKey: `${ana.community.id}/bylaws.pdf`,
				status: 'extracted',
				statusDetail: null,
				pagesExtracted: 1,
				pagesTotal: 1,
				uploadedBy: ana.user.id,
				uploadedAt: new Date(NOW),
				extractedAt: new Date(NOW)
			})
			.run();
		db.insert(passage)
			.values({
				id: newId(),
				documentId: id,
				page: 4,
				ordinal: 0,
				text: 'Repairs to the water pump are paid from the maintenance fund.',
				textHash: 'y'.repeat(64),
				bbox: null
			})
			.run();
		indexDocument(db, ana.community.id, id);
		expect(find(ana, 'water pump')).toHaveLength(1);

		await deleteDocument(ana, id, { db });

		expect(find(ana, 'water pump')).toEqual([]);
	});

	it('indexes a paragraph-sized document in batches, replacing rather than duplicating', () => {
		// A PDF read into paragraphs is thousands of passages; the batched calls
		// must keep the replace-never-duplicate contract across chunk boundaries.
		const id = newId();
		db.insert(document)
			.values({
				id,
				communityId: ana.community.id,
				filename: 'minutes.pdf',
				mime: 'application/pdf',
				bytes: 100,
				sha256: 'z'.repeat(64),
				storageKey: `${ana.community.id}/minutes.pdf`,
				status: 'extracted',
				uploadedAt: new Date(NOW)
			})
			.run();
		db.insert(passage)
			.values(
				Array.from({ length: 1_203 }, (_, i) => ({
					id: newId(),
					documentId: id,
					page: 1 + Math.floor(i / 40),
					ordinal: i % 40,
					text:
						i === 1_202
							? 'The orchard ladder lives in the barn.'
							: `Paragraph ${i} of the minutes.`,
					textHash: String(i).padStart(64, '0')
				}))
			)
			.run();

		const rows = () =>
			(
				db.all(
					sql`select count(*) as n from search_document where community_id = ${ana.community.id} and kind = 'passage'`
				) as { n: number }[]
			)[0]!.n;

		indexDocument(db, ana.community.id, id);
		indexDocument(db, ana.community.id, id);
		expect(rows()).toBe(1_203);
		expect(find(ana, 'orchard ladder')).toHaveLength(1);

		removeDocumentFromIndex(db, ana.community.id, id);
		expect(rows()).toBe(0);
	});
});

describe('the rebuild', () => {
	it('answers identically to the index the writes built', () => {
		decide(ana, 'Spending authority', SPENDING);
		decide(ana, 'Quiet hours', 'Nobody may run the water pump after 22:00.');
		openDiscussion(
			ana,
			{ title: 'Who signs for the pump?', about: { kind: 'open_question' } },
			{ db }
		);

		const incremental = refs(find(ana, 'water pump spend'));
		expect(incremental.length).toBeGreaterThan(0);

		rebuildSearchIndex(db, ana.community.id);

		expect(refs(find(ana, 'water pump spend'))).toEqual(incremental);
	});

	it('is safe to run twice', () => {
		decide(ana, 'Spending authority', SPENDING);
		rebuildSearchIndex(db, ana.community.id);
		const once = refs(find(ana, 'spend'));

		rebuildSearchIndex(db, ana.community.id);

		// A rebuild that doubled every row when somebody ran it twice would be a
		// recovery tool nobody dares use.
		expect(refs(find(ana, 'spend'))).toEqual(once);
	});

	it('rebuilds one community without touching another', () => {
		decide(ana, 'Spending authority', SPENDING);
		decide(bo, 'Spending authority', SPENDING);

		rebuildSearchIndex(db, ana.community.id);

		expect(find(bo, 'spend')).toHaveLength(2);
	});
});

describe('an index write belongs to the transaction that caused it', () => {
	it('takes the decision down with it when the index write fails', () => {
		const thread = openDiscussion(
			ana,
			{ title: 'Spending authority', about: { kind: 'clause', clauseKey: COUNTABLE.key } },
			{ db }
		);
		addProposal(ana, { discussionId: thread.id, body: SPENDING }, { db });

		// The direction that actually proves membership of the transaction. A
		// freeze that failed *before* indexing would roll back whatever the index
		// does; only a failure in the index write itself shows the decision
		// depends on it.
		const real = getSearchIndex(db);
		setSearchIndexForTests({
			...real,
			index(communityId, doc) {
				if (doc.kind === 'decision') throw new Error('index unavailable');
				real.index(communityId, doc);
			}
		});

		try {
			expect(() =>
				freeze(
					ana,
					{
						discussionId: thread.id,
						idempotencyKey: 'rollback',
						title: 'Spending authority',
						type: 'strategic',
						mechanism: 'consent'
					} as Parameters<typeof freeze>[1],
					{ db }
				)
			).toThrow('index unavailable');
		} finally {
			setSearchIndexForTests(null);
		}

		expect(db.select().from(decision).all()).toEqual([]);
		expect(find(ana, 'spend')).toEqual([]);
	});

	it('makes a discussion findable the moment it exists', () => {
		const opened = openDiscussion(
			ana,
			{ title: 'Who signs for the water pump?', about: { kind: 'open_question' } },
			{ db }
		);
		const hits = find(ana, 'water pump');
		expect(hits).toHaveLength(1);
		expect(hits[0]!.subjectId).toBe(opened.id);
	});
});

describe('the index knows what may be seen', () => {
	it('hides a restricted definition from a member outside its audience', () => {
		const recorded = decide(ana, 'Spending authority', SECRET_WORDS);
		const definitionId = db
			.select()
			.from(definitionTable)
			.where(eq(definitionTable.communityId, ana.community.id))
			.get()!.id;

		// Findable by everybody first, so the assertion afterwards is about the
		// restriction rather than about the words never having been there.
		expect(find(lena, 'quetzal').length).toBeGreaterThan(0);

		restrict(
			ana,
			{ type: 'definition', id: definitionId },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		// The index is where this leak would be least visible: a hit shows the
		// title and an excerpt, so a search result is the content, not a pointer
		// to it that a later permission check could still refuse.
		expect(find(lena, 'quetzal').map((hit) => hit.subjectId)).not.toContain(definitionId);
		expect(find(ana, 'quetzal').map((hit) => hit.subjectId)).toContain(definitionId);
		expect(recorded.ref).toMatch(/^DEC-/);
	});

	it('reflects a visibility change in the same transaction as the change', () => {
		const definitionId = (() => {
			decide(ana, 'Spending authority', SECRET_WORDS);
			return db
				.select()
				.from(definitionTable)
				.where(eq(definitionTable.communityId, ana.community.id))
				.get()!.id;
		})();

		restrict(
			ana,
			{ type: 'definition', id: definitionId },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		// No job, no lag: a window in which the search still returns what the
		// community just hid is the whole of the failure.
		expect(find(lena, 'quetzal').map((hit) => hit.subjectId)).not.toContain(definitionId);
	});

	it('shows an anonymous reader only what is published', () => {
		decide(ana, 'Spending authority', SECRET_WORDS);
		expect(getSearchIndex(db).query(ana.community.id, 'quetzal', { levels: ['world'] })).toEqual(
			[]
		);
	});

	it('answers identically after a rebuild', () => {
		decide(ana, 'Spending authority', SECRET_WORDS);
		const before = refs(find(ana, 'quetzal spending'));

		rebuildSearchIndex(db, ana.community.id);

		// The rebuild reads visibility from the rows, so a rebuilt index and an
		// incrementally-built one must agree about it too — which is the property
		// the release step depends on.
		expect(refs(find(ana, 'quetzal spending'))).toEqual(before);
	});
});

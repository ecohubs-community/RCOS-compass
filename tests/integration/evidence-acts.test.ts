import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definitionSource, evidence, passage } from '../../src/lib/server/db/schema/documents.js';
import { membership } from '../../src/lib/server/db/schema/tenancy.js';
import {
	changeClause,
	confirmEvidence,
	definitionOrigin,
	dismissPassage,
	languageCoverage,
	mapPassage,
	reconfirmCandidates,
	reconfirmStale,
	staleEvidenceForDocument,
	turnIntoDefinition
} from '../../src/lib/server/services/evidence.js';
import { readiness } from '../../src/lib/server/services/readiness.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { adoptStandard, makeDocument, makeEvidence, makePassage } from '../support/documents.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The acts a member takes on a suggestion beyond yes and no, and what happens to
 * claims when the file under them changes. The change's `evidence` spec.
 */
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const SUGGESTED = view.clauseByRef('3.3.2')!;
const CHOSEN = view.clauseByRef('3.6.2')!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let standardId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardId = adoptStandard(db, home.id);
	const person = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: person,
		community: home,
		membership: makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const suggestion = (
	at: { id: string; documentId: string; text: string } & Parameters<
		typeof makeEvidence
	>[1]['passage'],
	clauseKey = SUGGESTED.key
) =>
	makeEvidence(db, {
		communityId: ana.community.id,
		communityStandardId: standardId,
		passage: at,
		clauseKey,
		state: 'suggested',
		reason: 'Names a trial period, not how it ends.'
	});

const rowsFor = (passageId: string) =>
	db.select().from(evidence).where(eq(evidence.passageId, passageId)).all();

describe('changing a suggestion-s clause', () => {
	it('dismisses the suggestion and confirms the chosen clause, in one act', () => {
		const doc = makeDocument(db, ana.community.id);
		const at = makePassage(db, doc.id, { text: 'Any member may depart with sixty days notice.' });
		const guess = suggestion(at);

		const confirmed = changeClause(ana, guess.id, CHOSEN.ref, { db });

		expect(confirmed).toMatchObject({
			clauseKey: CHOSEN.key,
			state: 'confirmed',
			suggestedBy: 'human',
			confirmedBy: ana.user.id,
			documentId: doc.id
		});
		const rows = rowsFor(at.id);
		expect(rows.find((row) => row.id === guess.id)!.state).toBe('dismissed');
		expect(rows).toHaveLength(2);
	});

	it('reuses a pairing dismissed earlier rather than creating a second', () => {
		const doc = makeDocument(db, ana.community.id);
		const at = makePassage(db, doc.id);
		const guess = suggestion(at);
		const earlier = makeEvidence(db, {
			communityId: ana.community.id,
			communityStandardId: standardId,
			passage: at,
			clauseKey: CHOSEN.key,
			state: 'dismissed',
			confirmedBy: ana.user.id
		});

		const confirmed = changeClause(ana, guess.id, CHOSEN.key, { db });

		expect(confirmed.id).toBe(earlier.id);
		expect(confirmed.state).toBe('confirmed');
		expect(rowsFor(at.id)).toHaveLength(2);
	});

	it('refuses a clause the standard does not have, and leaves the suggestion open', () => {
		const doc = makeDocument(db, ana.community.id);
		const guess = suggestion(makePassage(db, doc.id));

		expect(catchRefusal(() => changeClause(ana, guess.id, '99.99', { db }))?.status).toBe(400);
		expect(db.select().from(evidence).where(eq(evidence.id, guess.id)).get()!.state).toBe(
			'suggested'
		);
	});

	it('refuses a member who may not confirm mappings', () => {
		const doc = makeDocument(db, ana.community.id);
		const guess = suggestion(makePassage(db, doc.id));
		db.update(membership)
			.set({ endedAt: new Date(NOW) })
			.where(eq(membership.id, ana.membership.id))
			.run();
		const observer = { ...ana, membership: { ...ana.membership, role: 'observer' as never } };

		expect(catchRefusal(() => changeClause(observer, guess.id, CHOSEN.ref, { db }))?.status).toBe(
			403
		);
	});

	it('answers for another community-s evidence as if it does not exist', () => {
		const doc = makeDocument(db, ana.community.id);
		const guess = suggestion(makePassage(db, doc.id));
		const elsewhere = makeCommunity(db, { slug: 'elsewhere' });
		adoptStandard(db, elsewhere.id);
		const marco = makeUser(db, { email: 'marco@example.org' });
		const theirs: Ctx = {
			user: marco,
			community: elsewhere,
			membership: makeMembership(db, elsewhere.id, marco.id, { role: 'steward', isOwner: true }),
			now: () => NOW
		};

		expect(catchRefusal(() => changeClause(theirs, guess.id, CHOSEN.ref, { db }))?.status).toBe(
			404
		);
	});
});

describe('not governance', () => {
	it('dismisses every open suggestion on a passage and leaves a confirmed claim alone', () => {
		const doc = makeDocument(db, ana.community.id);
		const at = makePassage(db, doc.id);
		suggestion(at, SUGGESTED.key);
		const kept = mapPassage(ana, { passageId: at.id, clause: CHOSEN.key }, { db });
		suggestion(at, view.countableClauses()[0]!.key);

		expect(dismissPassage(ana, at.id, { db })).toBe(2);
		const rows = rowsFor(at.id);
		expect(rows.find((row) => row.id === kept.id)!.state).toBe('confirmed');
		expect(rows.filter((row) => row.state === 'dismissed')).toHaveLength(2);
	});
});

describe('mapping part of a passage', () => {
	it('records the selected range', () => {
		const doc = makeDocument(db, ana.community.id);
		const at = makePassage(db, doc.id, {
			text: 'Members leave by notice. Shares settle in thirty days.'
		});

		const claim = mapPassage(
			ana,
			{ passageId: at.id, clause: CHOSEN.ref, excerpt: { start: 0, end: 24 } },
			{ db }
		);
		expect(at.text.slice(claim.excerptStart!, claim.excerptEnd!)).toBe('Members leave by notice.');
	});

	it('refuses a range outside the passage, and writes nothing', () => {
		const doc = makeDocument(db, ana.community.id);
		const at = makePassage(db, doc.id, { text: 'Short.' });

		expect(
			catchRefusal(() =>
				mapPassage(
					ana,
					{ passageId: at.id, clause: CHOSEN.ref, excerpt: { start: 2, end: 99 } },
					{ db }
				)
			)?.status
		).toBe(400);
		expect(db.select().from(evidence).all()).toHaveLength(0);
	});
});

describe('claims after the file changes', () => {
	/** What a replacement does to the rows: stale the claims, drop the passages, write new ones. */
	function replaceWith(doc: { id: string }, texts: string[]) {
		staleEvidenceForDocument(db, doc.id);
		db.delete(passage).where(eq(passage.documentId, doc.id)).run();
		return texts.map((text) => makePassage(db, doc.id, { text }));
	}

	it('offers a claim whose paragraph is unchanged, and it stays stale until re-confirmed', () => {
		const doc = makeDocument(db, ana.community.id);
		const exit = 'A member may leave at any time by telling a steward.';
		const claim = mapPassage(
			ana,
			{ passageId: makePassage(db, doc.id, { text: exit }).id, clause: CHOSEN.ref },
			{ db }
		);

		const [same] = replaceWith(doc, [exit, 'Something new entirely.']);
		const offered = reconfirmCandidates(ana, doc.id, { db });
		expect(offered).toEqual([
			expect.objectContaining({ evidenceId: claim.id, passageId: same!.id, clauseRef: '3.6.2' })
		]);
		expect(db.select().from(evidence).where(eq(evidence.id, claim.id)).get()!.state).toBe('stale');

		const back = reconfirmStale(ana, claim.id, { db });
		expect(back).toMatchObject({ id: claim.id, state: 'confirmed', passageId: same!.id });
	});

	it('does not offer a claim whose paragraph changed', () => {
		const doc = makeDocument(db, ana.community.id);
		const claim = mapPassage(
			ana,
			{ passageId: makePassage(db, doc.id, { text: 'Sixty days notice.' }).id, clause: CHOSEN.ref },
			{ db }
		);
		replaceWith(doc, ['Ninety days notice.']);

		expect(reconfirmCandidates(ana, doc.id, { db })).toEqual([]);
		expect(catchRefusal(() => reconfirmStale(ana, claim.id, { db }))?.status).toBe(409);
	});

	it('confirms a pairing a new scan already suggested, with no constraint error', () => {
		const doc = makeDocument(db, ana.community.id);
		const exit = 'A member may leave at any time by telling a steward.';
		const claim = mapPassage(
			ana,
			{ passageId: makePassage(db, doc.id, { text: exit }).id, clause: CHOSEN.ref },
			{ db }
		);
		const [same] = replaceWith(doc, [exit]);
		const again = suggestion(same!, CHOSEN.key);

		const confirmed = reconfirmStale(ana, claim.id, { db });
		expect(confirmed.id).toBe(again.id);
		expect(confirmed.state).toBe('confirmed');
		expect(db.select().from(evidence).where(eq(evidence.id, claim.id)).get()!.state).toBe('stale');
		// Put back, so no longer offered — though the old row stays stale.
		expect(reconfirmCandidates(ana, doc.id, { db })).toEqual([]);
	});

	it('never offers a suggestion nobody confirmed', () => {
		const doc = makeDocument(db, ana.community.id);
		const exit = 'A member may leave at any time by telling a steward.';
		suggestion(makePassage(db, doc.id, { text: exit }), CHOSEN.key);
		replaceWith(doc, [exit]);

		expect(reconfirmCandidates(ana, doc.id, { db })).toEqual([]);
	});

	it('stops offering a claim once the new scan-s suggestion for it is confirmed', () => {
		const doc = makeDocument(db, ana.community.id);
		const exit = 'A member may leave at any time by telling a steward.';
		mapPassage(
			ana,
			{ passageId: makePassage(db, doc.id, { text: exit }).id, clause: CHOSEN.ref },
			{ db }
		);
		const [same] = replaceWith(doc, [exit]);
		expect(reconfirmCandidates(ana, doc.id, { db })).toHaveLength(1);

		confirmEvidence(ana, suggestion(same!, CHOSEN.key).id, { db });
		expect(reconfirmCandidates(ana, doc.id, { db })).toEqual([]);
	});

	it('answers for another community-s stale claim as if it does not exist', () => {
		const doc = makeDocument(db, ana.community.id);
		const claim = mapPassage(
			ana,
			{ passageId: makePassage(db, doc.id, { text: 'Kept words.' }).id, clause: CHOSEN.ref },
			{ db }
		);
		replaceWith(doc, ['Kept words.']);
		const elsewhere = makeCommunity(db, { slug: 'elsewhere' });
		const marco = makeUser(db, { email: 'marco@example.org' });
		const theirs: Ctx = {
			user: marco,
			community: elsewhere,
			membership: makeMembership(db, elsewhere.id, marco.id, { role: 'steward', isOwner: true }),
			now: () => NOW
		};

		expect(catchRefusal(() => reconfirmStale(theirs, claim.id, { db }))?.status).toBe(404);
		expect(catchRefusal(() => reconfirmCandidates(theirs, doc.id, { db }))?.status).toBe(404);
	});

	it('keeps a definition-s origin line after its document is replaced, and restores the link on re-confirm', () => {
		const doc = makeDocument(db, ana.community.id, { filename: 'bylaws-2019.pdf' });
		const exit = 'A member may leave at any time by telling a steward.';
		const claim = mapPassage(
			ana,
			{ passageId: makePassage(db, doc.id, { text: exit, page: 4 }).id, clause: CHOSEN.ref },
			{ db }
		);
		const made = turnIntoDefinition(ana, claim.id, { db });
		const definitionId = made.kind === 'draft' ? made.definitionId : '';
		expect(definitionOrigin(ana, definitionId, { db })).toMatchObject({ page: 4 });

		const [same] = replaceWith(doc, [exit]);
		const afterReplace = definitionOrigin(ana, definitionId, { db })!;
		expect(afterReplace).toMatchObject({
			filename: 'bylaws-2019.pdf',
			passageId: null,
			quote: exit
		});

		reconfirmStale(ana, claim.id, { db });
		expect(definitionOrigin(ana, definitionId, { db })).toMatchObject({ passageId: same!.id });
		expect(db.select().from(definitionSource).get()!.passageId).toBe(same!.id);
	});

	it('moves no number', () => {
		const doc = makeDocument(db, ana.community.id);
		const at = makePassage(db, doc.id);
		const guess = suggestion(at);
		const before = readiness(ana, { db })!.percent;

		changeClause(ana, guess.id, CHOSEN.ref, { db });
		dismissPassage(ana, at.id, { db });

		expect(readiness(ana, { db })!.percent).toBe(before);
		expect(languageCoverage(ana, { db }).have).toBe(1);
	});
});

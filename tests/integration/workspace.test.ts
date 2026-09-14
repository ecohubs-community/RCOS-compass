import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { activeStandardView } from '../../src/lib/server/services/completeness.js';
import { workspaceView } from '../../src/lib/server/services/workspace.js';
import { createTestDb } from '../support/db.js';
import { adoptStandard, makeDocument, makeEvidence, makePassage } from '../support/documents.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * What the mapping workspace is given: cards in document order, the next open
 * passage, the requirement behind a card — and never a confidence.
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

const view = (documentId: string, asked: { page?: number; passage?: string } = {}) =>
	workspaceView(
		ana,
		documentId,
		{ page: asked.page ?? null, passage: asked.passage ?? null },
		{ db }
	);

function bylaws() {
	const doc = makeDocument(db, ana.community.id, { pagesTotal: 7 });
	const heading = makePassage(db, doc.id, { page: 4, kind: 'heading', text: 'Article IV' });
	const first = makePassage(db, doc.id, { page: 4, text: 'New residents are admitted by vote.' });
	const second = makePassage(db, doc.id, {
		page: 4,
		text: 'A member may leave. They give sixty days notice.'
	});
	const later = makePassage(db, doc.id, { page: 7, text: 'The council may expel a member.' });
	return { doc, heading, first, second, later };
}

const claim = (
	passage: Parameters<typeof makeEvidence>[1]['passage'],
	state: 'suggested' | 'confirmed' | 'dismissed',
	clauseKey?: string
) =>
	makeEvidence(db, {
		communityId: ana.community.id,
		communityStandardId: standardId,
		passage,
		state,
		clauseKey,
		reason: state === 'suggested' ? 'Says who leaves, not how the share is settled.' : null,
		confirmedBy: ana.user.id
	});

describe('the workspace view', () => {
	it('never sends a confidence to the screen', () => {
		const { doc, second } = bylaws();
		claim(second, 'suggested');

		const serialised = JSON.stringify(view(doc.id));
		expect(serialised).not.toMatch(/confidence/i);
		expect(serialised).toContain('Says who leaves');
	});

	it('orders cards as the document does, numbering paragraphs within their page', () => {
		const { doc, second, later } = bylaws();
		claim(later, 'suggested');
		claim(second, 'confirmed');

		const cards = view(doc.id).cards;
		expect(cards.map((card) => [card.page, card.number, card.state])).toEqual([
			[4, 2, 'confirmed'],
			[7, 1, 'suggested']
		]);
		expect(cards[0]!.confirmer).toBe('Ana Ruiz');
		expect(cards[1]!.confirmer).toBeNull();
	});

	it('shows the page of the selected passage, whatever page was asked for', () => {
		const { doc, later } = bylaws();
		const shown = view(doc.id, { page: 4, passage: later.id });
		expect(shown.paper.page).toBe(7);
		expect(shown.selected).toBe(later.id);
		expect(view(doc.id, { passage: 'somebody-elses-passage' }).selected).toBeNull();
	});

	it('finds the next open passage after the selected one, wrapping to the start', () => {
		const { doc, first, second, later } = bylaws();
		claim(first, 'suggested');
		claim(second, 'confirmed');
		claim(later, 'suggested');

		expect(view(doc.id, { passage: first.id }).nextOpen).toBe(later.id);
		expect(view(doc.id, { passage: later.id }).nextOpen).toBe(first.id);
		expect(view(doc.id).nextOpen).toBe(first.id);
	});

	it('has no next open passage, and offers to finish, when every identified passage is answered', () => {
		const { doc, second } = bylaws();
		claim(second, 'confirmed');

		const shown = view(doc.id);
		expect(shown.nextOpen).toBeNull();
		expect(shown.state).toBe('in_progress');
		expect(shown.canMarkDone).toBe(true);
	});

	it('carries the requirement behind a card, and says when a clause has no section to define', () => {
		const { doc, first, second } = bylaws();
		const standard = activeStandardView(db, ana)!.view;
		const exit = standard.clauseByRef('3.6.2')!;
		const unowned = standard.clauses.find((clause) => clause.owner === null)!;
		claim(second, 'confirmed', exit.key);
		claim(first, 'confirmed', unowned.key);

		const shown = view(doc.id);
		expect(shown.requirements[exit.key]).toMatchObject({
			standard: 'RCOS-Core v0.1',
			ref: '3.6.2',
			normativity: exit.normativity
		});
		expect(shown.requirements[exit.key]!.text.length).toBeGreaterThan(20);
		const byRef = new Map(shown.cards.map((card) => [card.clauseRef, card]));
		expect(byRef.get('3.6.2')!.definable).toBe(true);
		expect(byRef.get(unowned.ref)!.definable).toBe(false);
		expect(shown.clauses.length).toBeGreaterThan(100);
	});

	it('counts identified passages on the page shown', () => {
		const { doc, first, second, later } = bylaws();
		claim(first, 'suggested');
		claim(second, 'dismissed');
		claim(later, 'suggested');

		expect(view(doc.id, { page: 4 }).identifiedOnPage).toBe(2);
		expect(view(doc.id, { page: 7 }).identifiedOnPage).toBe(1);
	});
});

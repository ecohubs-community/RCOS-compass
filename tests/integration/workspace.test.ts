import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { activeStandardView } from '../../src/lib/server/services/completeness.js';
import { lineBox } from '../../src/lib/components/documents/pdf/geometry.js';
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

describe('whether the file is stored', () => {
	let uploadDir: string;

	beforeEach(() => {
		uploadDir = mkdtempSync(join(tmpdir(), 'compass-workspace-'));
		vi.stubEnv('UPLOAD_DIR', uploadDir);
		resetConfigForTests();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		resetConfigForTests();
		rmSync(uploadDir, { recursive: true, force: true });
	});

	it('says the file is there when it is in the upload folder', () => {
		const { doc } = bylaws();
		const path = join(uploadDir, doc.storageKey);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, '%PDF-1.7');

		expect(view(doc.id).document.stored).toBe(true);
	});

	it('says the file is missing, and still shows the text read from it, when it has gone', () => {
		const { doc } = bylaws();

		const shown = view(doc.id, { page: 4 });
		expect(shown.document.stored).toBe(false);
		expect(shown.paper.passages.length).toBeGreaterThan(0);
		// Present or absent is all it says: never where the file was kept.
		expect(JSON.stringify(shown)).not.toContain(doc.storageKey);
	});
});

describe('where each paragraph of a PDF sits', () => {
	const box = (y: number, start: number, end: number) => ({
		x: 72.04321,
		y: y + 0.0371,
		w: 330.456,
		h: 11,
		start,
		end
	});

	function pdfWithLines() {
		const doc = makeDocument(db, ana.community.id, { pagesTotal: 2 });
		const heading = makePassage(db, doc.id, {
			page: 1,
			kind: 'heading',
			text: 'Membership',
			bbox: JSON.stringify([box(720, 0, 10)])
		});
		const claimed = makePassage(db, doc.id, {
			page: 1,
			text: 'New residents are admitted by vote.',
			bbox: JSON.stringify([box(680, 0, 35)])
		});
		const unclaimed = makePassage(db, doc.id, {
			page: 2,
			text: 'Guests are welcome for a week, and longer stays go to the assembly.',
			bbox: JSON.stringify([box(680, 0, 40), box(664, 41, 67)])
		});
		claim(claimed, 'suggested');
		return { doc, heading, claimed, unclaimed };
	}

	it('sends the lines of a paragraph nobody has claimed, to within 0.1 pt', () => {
		const { doc, unclaimed } = pdfWithLines();

		const sent = view(doc.id).paragraphLines.find((row) => row.passageId === unclaimed.id);
		expect(sent?.page).toBe(2);
		const stored = JSON.parse(unclaimed.bbox!) as ReturnType<typeof box>[];
		expect(sent!.lines).toHaveLength(2);
		sent!.lines.map(lineBox).forEach((line, index) => {
			const original = stored[index]!;
			for (const key of ['x', 'y', 'w', 'h'] as const) {
				expect(Math.abs(line[key] - original[key])).toBeLessThanOrEqual(0.05);
			}
			expect([line.start, line.end]).toEqual([original.start, original.end]);
		});
	});

	it('sends a claimed paragraph once, as lines, and its highlight without them', () => {
		const { doc, claimed } = pdfWithLines();
		const shown = view(doc.id);

		expect(shown.paragraphLines.filter((row) => row.passageId === claimed.id)).toHaveLength(1);
		const highlight = shown.highlights.find((row) => row.passageId === claimed.id);
		expect(highlight).toBeDefined();
		expect(highlight).not.toHaveProperty('lines');
	});

	it('leaves out headings, which are never mapped', () => {
		const { doc, heading } = pdfWithLines();
		expect(view(doc.id).paragraphLines.map((row) => row.passageId)).not.toContain(heading.id);
	});

	it('carries positions only, never the words of a paragraph', () => {
		const { doc, unclaimed } = pdfWithLines();
		const serialised = JSON.stringify(view(doc.id, { page: 1 }).paragraphLines);
		expect(serialised).not.toContain('Guests');
		expect(serialised).not.toContain(unclaimed.text.slice(0, 12));
	});

	it('sends nothing for a document without pages', () => {
		const doc = makeDocument(db, ana.community.id, {
			filename: 'agreements.docx',
			mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		});
		makePassage(db, doc.id, { text: 'Quiet hours are agreed each season.' });
		expect(view(doc.id).paragraphLines).toEqual([]);
	});

	it('is a 404 for a member of another community', () => {
		const { doc } = pdfWithLines();
		const elsewhere = makeCommunity(db, { slug: 'other-place' });
		const stranger = makeUser(db, { email: 'marco@example.org', name: 'Marco' });
		const outsider: Ctx = {
			user: stranger,
			community: elsewhere,
			membership: makeMembership(db, elsewhere.id, stranger.id, { role: 'steward' }),
			now: () => NOW
		};

		let status: number | undefined;
		try {
			workspaceView(outsider, doc.id, { page: null, passage: null }, { db });
		} catch (problem) {
			status = (problem as { status?: number }).status;
		}
		expect(status).toBe(404);
	});
});

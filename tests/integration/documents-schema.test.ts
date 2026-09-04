import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import { document, evidence, passage } from '../../src/lib/server/db/schema/documents.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeUser } from '../support/factories.js';

/**
 * What the database refuses, rather than what the application remembers to.
 *
 * P3 taught this the hard way: drizzle's `text({ enum })` is a TypeScript
 * narrowing and nothing more, and a decision with a type no screen could render
 * reached the register through it. Every state on these tables is a real CHECK,
 * and each one is proved here by writing the thing it exists to refuse.
 */
const NOW = new Date(Date.UTC(2026, 8, 4, 12, 0, 0));

let db: Db;
let cleanup: () => void;
let communityId: string;
let standardId: string;
let userId: string;
let passageId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	communityId = makeCommunity(db, { slug: 'valle-verde' }).id;
	userId = makeUser(db, { email: 'ana@example.org' }).id;

	standardId = newId();
	db.insert(communityStandard)
		.values({
			id: standardId,
			communityId,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: NOW,
			retiredAt: null
		})
		.run();

	const documentId = newId();
	db.insert(document)
		.values({
			id: documentId,
			communityId,
			filename: 'bylaws.pdf',
			mime: 'application/pdf',
			bytes: 2048,
			sha256: 'a'.repeat(64),
			storageKey: `${communityId}/${newId()}`,
			status: 'extracted',
			statusDetail: null,
			pagesExtracted: 5,
			pagesTotal: 5,
			uploadedBy: userId,
			uploadedAt: NOW,
			extractedAt: NOW
		})
		.run();

	passageId = newId();
	db.insert(passage)
		.values({
			id: passageId,
			documentId,
			page: 1,
			ordinal: 0,
			text: 'A member may leave at any time by telling a steward.',
			textHash: 'b'.repeat(64),
			bbox: null
		})
		.run();
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const evidenceRow = (overrides: Partial<typeof evidence.$inferInsert> = {}) => ({
	id: newId(),
	communityId,
	passageId,
	communityStandardId: standardId,
	clauseKey: 'l0.purpose-definition.1',
	state: 'suggested' as const,
	confidence: null,
	suggestedBy: 'human' as const,
	confirmedBy: null,
	confirmedAt: null,
	createdAt: NOW,
	...overrides
});

describe('the database refuses a state nobody defined', () => {
	it('refuses a document status outside the five', () => {
		expect(() =>
			db
				.insert(document)
				.values({
					id: newId(),
					communityId,
					filename: 'x.pdf',
					mime: 'application/pdf',
					bytes: 1,
					sha256: 'c'.repeat(64),
					storageKey: 'x',
					// The exact class of bug P3 found in the decision register.
					status: 'nearly-done' as 'extracted',
					statusDetail: null,
					pagesExtracted: null,
					pagesTotal: null,
					uploadedBy: userId,
					uploadedAt: NOW,
					extractedAt: null
				})
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('refuses an evidence state outside the four', () => {
		expect(() =>
			db
				.insert(evidence)
				.values(evidenceRow({ state: 'probably' as 'suggested' }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('refuses a source that is neither a person nor a model', () => {
		expect(() =>
			db
				.insert(evidence)
				.values(evidenceRow({ suggestedBy: 'magic' as 'human' }))
				.run()
		).toThrow(/CHECK constraint/i);
	});
});

describe('confirmed evidence has somebody behind it', () => {
	it('refuses confirmed with nobody who confirmed it', () => {
		// The state and the person travel together, or the row is a claim with no
		// author — and "who said we have language about this?" is the question the
		// whole table exists to answer.
		expect(() =>
			db
				.insert(evidence)
				.values(evidenceRow({ state: 'confirmed' }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('refuses a confirmer on something not confirmed', () => {
		expect(() =>
			db
				.insert(evidence)
				.values(evidenceRow({ state: 'suggested', confirmedBy: userId, confirmedAt: NOW }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('accepts confirmed with its author and time', () => {
		db.insert(evidence)
			.values(evidenceRow({ state: 'confirmed', confirmedBy: userId, confirmedAt: NOW }))
			.run();

		const [row] = db.select().from(evidence).all();
		expect(row!.state).toBe('confirmed');
		expect(row!.confirmedBy).toBe(userId);
	});
});

describe('one claim per passage per clause', () => {
	it('refuses the same pair twice', () => {
		db.insert(evidence).values(evidenceRow()).run();
		// A second suggestion for a pair somebody already dismissed has to update
		// that row, not arrive again — otherwise dismissing something is temporary.
		expect(() => db.insert(evidence).values(evidenceRow()).run()).toThrow(/UNIQUE/i);
	});

	it('allows the same passage against a different clause', () => {
		db.insert(evidence).values(evidenceRow()).run();
		db.insert(evidence)
			.values(evidenceRow({ clauseKey: 'l1.membership.1' }))
			.run();
		expect(db.select().from(evidence).all()).toHaveLength(2);
	});
});

describe('a passage has one position in its document', () => {
	it('refuses two passages at the same page and ordinal', () => {
		const documentId = db.select().from(document).all()[0]!.id;
		expect(() =>
			db
				.insert(passage)
				.values({
					id: newId(),
					documentId,
					page: 1,
					ordinal: 0,
					text: 'Something else entirely.',
					textHash: 'd'.repeat(64),
					bbox: null
				})
				.run()
		).toThrow(/UNIQUE/i);
	});
});

describe('a document takes its passages and evidence with it', () => {
	it('deletes passages when the document goes', () => {
		db.insert(evidence).values(evidenceRow()).run();
		const documentId = db.select().from(document).all()[0]!.id;

		db.delete(document).where(eq(document.id, documentId)).run();

		expect(db.select().from(passage).all()).toHaveLength(0);
		// Evidence cascades with the passage it points at: a claim about a passage
		// that no longer exists is not a claim, it is a dangling row.
		expect(db.select().from(evidence).all()).toHaveLength(0);
	});
});

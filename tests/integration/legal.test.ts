import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { legalReview } from '../../src/lib/server/db/schema/operations.js';
import {
	contentHash,
	legalDocument,
	LEGAL_DOCUMENTS,
	markReviewed
} from '../../src/lib/server/services/legal.js';
import { reviewLegalDocument } from '../../src/lib/server/services/admin/legal.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeUser } from '../support/factories.js';

/**
 * The documents, and the review that follows the exact words.
 * `docs/10-legal-and-operations.md` §6.
 *
 * The property that carries this file is the one the content hash exists for: a
 * review covers one wording and not the document's name. Editing a word must
 * bring the draft notice back without anybody remembering to — because the
 * failure it prevents is a policy that reads as reviewed while saying something
 * nobody reviewed.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let admin: ReturnType<typeof makeUser>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	admin = makeUser(db, { email: 'root@example.org', name: 'Root' });
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('a document is a draft until one exact wording is reviewed', () => {
	it('carries no review to begin with', () => {
		expect(legalDocument('privacy', { db }).reviewed).toBeNull();
	});

	it('is reviewed once somebody says so', () => {
		const before = legalDocument('privacy', { db });
		markReviewed(db, {
			id: 'privacy',
			sha256: before.sha256,
			reviewedBy: admin.id,
			note: 'counsel',
			now: NOW
		});

		const after = legalDocument('privacy', { db });
		expect(after.reviewed?.at).toBe(NOW);
		expect(after.reviewed?.note).toBe('counsel');
	});

	it('becomes a draft again when one character changes', () => {
		markReviewed(db, {
			id: 'privacy',
			sha256: contentHash(LEGAL_DOCUMENTS.privacy.markdown),
			reviewedBy: admin.id,
			now: NOW
		});
		expect(legalDocument('privacy', { db }).reviewed).not.toBeNull();

		// The whole point of keying the review to the text rather than to the
		// document: this is what an edit does, with nobody in the loop.
		const edited = contentHash(`${LEGAL_DOCUMENTS.privacy.markdown} and one more clause.`);
		expect(edited).not.toBe(contentHash(LEGAL_DOCUMENTS.privacy.markdown));
		const reviews = db.select().from(legalReview).all();
		expect(reviews.every((row) => row.contentSha256 !== edited)).toBe(true);
	});

	it('refuses to review a wording that is no longer current', () => {
		// Somebody pressed the button on a page drawn before a deployment. Marking
		// the version they were not looking at is the one thing this must not do.
		const refusal = catchRefusal(() =>
			markReviewed(db, {
				id: 'privacy',
				sha256: 'f'.repeat(64),
				reviewedBy: admin.id,
				now: NOW
			})
		);
		expect(refusal?.status).toBe(409);
		expect(legalDocument('privacy', { db }).reviewed).toBeNull();
	});

	it('refuses a document that does not exist', () => {
		expect(
			catchRefusal(() =>
				reviewLegalDocument(db, {
					id: 'cookie-policy',
					sha256: 'x',
					reviewedBy: admin.id,
					now: NOW
				})
			)?.status
		).toBe(404);
	});
});

describe('the privacy policy says what the code does', () => {
	/**
	 * Whitespace-collapsed, because the property is what the policy *says* and the
	 * file is wrapped at eighty columns. A test that fails when prettier reflows a
	 * paragraph is a test somebody deletes.
	 */
	const privacy = LEGAL_DOCUMENTS.privacy.markdown.replace(/\s+/g, ' ');

	it('states the erasure position in the words the product implements', () => {
		// `docs/03` §10 asks for this tension to be stated verbatim. These are the
		// same words the erasure code produces, so a policy that drifts from the
		// implementation fails here rather than being discovered by a community.
		expect(privacy).toContain('Former member (M-0142)');
		expect(privacy).toMatch(/register.*(cannot|not).*(unmade|erased)|not erased/i);
		expect(privacy).toMatch(/not a hash of it/i);
	});

	it('says plainly what it cannot reach', () => {
		expect(privacy).toMatch(/exported a bundle|already exported/i);
		expect(privacy).toMatch(/not ours to rewrite|in their hands/i);
	});

	it('names the refusal a person will meet', () => {
		expect(privacy).toMatch(/only owner/i);
	});

	it('names where inference happens, or that none does', () => {
		expect(privacy).toMatch(/region/i);
		expect(privacy).toMatch(/no provider is configured/i);
	});

	it('is what the file says, not a copy that drifted', () => {
		// The `?raw` import is what puts the text in the bundle; this asserts it is
		// the same text as the file the repository reviews.
		expect(LEGAL_DOCUMENTS.privacy.markdown).toBe(readFileSync('content/legal/privacy.md', 'utf8'));
	});
});

import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { legalReview } from '../db/schema/operations.js';
import privacy from '../../../../content/legal/privacy.md?raw';
import pilotTerms from '../../../../content/legal/pilot-terms.md?raw';
import subProcessors from '../../../../content/legal/sub-processors.md?raw';

/**
 * The documents a community reads before agreeing to anything.
 * `docs/10-legal-and-operations.md` §6.
 *
 * **The text lives in git and the review lives in the database**, and the split
 * is the whole design. Prose belongs where it can be diffed, reviewed in a
 * commit and deployed atomically with the code whose behaviour it describes —
 * a database copy of a privacy policy drifts from the product it describes and
 * nobody notices. What a database can usefully hold is the operational fact that
 * one exact wording was reviewed by somebody with the standing to say so.
 *
 * So the review is keyed to the **hash of the text**. Editing a word changes the
 * hash and the draft notice comes back on its own, which is the property that
 * matters: the alternative is a review that silently covers wording nobody
 * reviewed.
 *
 * Imported with `?raw` rather than read from disk at runtime. Nothing copies
 * `content/` into a built bundle, and that failure appears in production and
 * never in development.
 */

export const LEGAL_DOCUMENTS = {
	privacy: { title: 'Privacy policy', markdown: privacy },
	'pilot-terms': { title: 'Pilot terms', markdown: pilotTerms },
	'sub-processors': { title: 'Who else touches your data', markdown: subProcessors }
} as const;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;

export const isLegalDocument = (id: string): id is LegalDocumentId => id in LEGAL_DOCUMENTS;

export const contentHash = (markdown: string): string =>
	createHash('sha256').update(markdown).digest('hex');

export type LegalDocument = {
	id: LegalDocumentId;
	title: string;
	markdown: string;
	sha256: string;
	/** Null while nobody with the standing to do it has said this wording is fine. */
	reviewed: { at: number; note: string | null } | null;
};

export function legalDocument(id: LegalDocumentId, options: { db?: Db } = {}): LegalDocument {
	const db = options.db ?? getDb();
	const { title, markdown } = LEGAL_DOCUMENTS[id];
	const sha256 = contentHash(markdown);

	const review = db
		.select()
		.from(legalReview)
		.where(and(eq(legalReview.document, id), eq(legalReview.contentSha256, sha256)))
		.orderBy(desc(legalReview.reviewedAt))
		.get();

	return {
		id,
		title,
		markdown,
		sha256,
		reviewed: review ? { at: review.reviewedAt.getTime(), note: review.note } : null
	};
}

/** Every document, for the admin screen that reviews them. */
export const legalDocuments = (options: { db?: Db } = {}): LegalDocument[] =>
	(Object.keys(LEGAL_DOCUMENTS) as LegalDocumentId[]).map((id) => legalDocument(id, options));

/**
 * Marking one wording reviewed.
 *
 * Platform admin only, and deliberately not undoable through the interface: the
 * way to withdraw a review is to change the text, which is a commit somebody can
 * see. `note` is who reviewed it in words — "counsel", "the operator" — because
 * "reviewed" without a reviewer answers a different question than the one an
 * auditor asks.
 */
export function markReviewed(
	db: Db,
	input: {
		id: LegalDocumentId;
		sha256: string;
		reviewedBy: string;
		note?: string | null;
		now: number;
	}
): void {
	const current = contentHash(LEGAL_DOCUMENTS[input.id].markdown);
	if (current !== input.sha256) {
		// The text moved between the screen being drawn and the button being
		// pressed: reviewing the version they were not looking at is the one thing
		// this must not do.
		error(409, 'The text changed since this page was loaded. Read it again, then confirm.');
	}

	db.insert(legalReview)
		.values({
			id: newId(),
			document: input.id,
			contentSha256: input.sha256,
			reviewedBy: input.reviewedBy,
			reviewedAt: new Date(input.now),
			note: input.note?.trim() || null
		})
		.onConflictDoNothing()
		.run();
}

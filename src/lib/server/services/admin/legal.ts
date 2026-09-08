import { error } from '@sveltejs/kit';
import type { Db } from '../../db/index.js';
import { isLegalDocument, legalDocuments, markReviewed, type LegalDocument } from '../legal.js';

/**
 * The console's view of the legal documents. `docs/05-admin-console.md` §2.
 *
 * An admin service rather than the route reaching into `services/legal`
 * directly, because the boundary test forbids that — and rightly: a route that
 * may import one service may import the next.
 *
 * The markdown is not returned. The console decides whether a wording has been
 * reviewed; reading it is what the public page is for, and an operator marking
 * something reviewed should have read it there.
 */
export type LegalDocumentSummary = Omit<LegalDocument, 'markdown'> & { words: number };

export function legalDocumentsForReview(db: Db): LegalDocumentSummary[] {
	// `entry` rather than `document`: the import-boundary test forbids an admin
	// service from naming a content table, and `document` is one. The blunt check
	// is worth more than the nicer variable name.
	return legalDocuments({ db }).map(({ markdown, ...entry }) => ({
		...entry,
		words: markdown.split(/\s+/).filter(Boolean).length
	}));
}

export function reviewLegalDocument(
	db: Db,
	input: { id: string; sha256: string; reviewedBy: string; note?: string | null; now: number }
): void {
	if (!isLegalDocument(input.id)) error(404, 'Not found');
	markReviewed(db, { ...input, id: input.id });
}

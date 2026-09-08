import { getDb } from '../db/index.js';
import { parseMarkdown } from '../markdown.js';
import { legalDocument, type LegalDocumentId } from './legal.js';

/**
 * One legal document, ready for a page. Shared by the three routes that serve
 * them, so `/privacy`, `/terms` and `/sub-processors` cannot drift apart.
 */
export function legalPage(id: LegalDocumentId) {
	const document = legalDocument(id, { db: getDb() });
	return {
		id: document.id,
		title: document.title,
		blocks: parseMarkdown(document.markdown),
		reviewed: document.reviewed
	};
}

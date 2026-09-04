import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import { getConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { document, passage } from '../db/schema/documents.js';
import { getLogger } from '../logger.js';
import { extract, ExtractionFailed } from './extract.js';
import { MIME, type AcceptedType } from './sniff.js';
import { absolutePathOf } from './storage.js';

/**
 * The extraction job. The first job whose outcome a member has to *read*.
 *
 * The queue's own failure handling — retry with backoff, then a dead letter — is
 * built for transient trouble, and extraction failures are almost never that: a
 * scan is still a scan on the fifth attempt, and a hostile file is still
 * hostile. So the handler converts every outcome, including failure, into a
 * terminal state written **on the document row**, where the screen the member is
 * already looking at can show it. The job itself completes; nothing here relies
 * on being retried.
 *
 * Idempotent the way at-least-once delivery requires: a re-claimed run finds the
 * document already terminal and does nothing, and the passages of an interrupted
 * run are replaced wholesale inside one transaction — so a document either has
 * its full set of passages or none, never a prefix.
 */

const TYPE_BY_MIME = Object.fromEntries(
	Object.entries(MIME).map(([type, mime]) => [mime, type as AcceptedType])
);

export async function runExtraction(db: Db, clock: Clock, documentId: string): Promise<void> {
	const found = db.select().from(document).where(eq(document.id, documentId)).get();

	// Gone (the upload's transaction rolled back after enqueueing), or already
	// dealt with by the run whose claim we inherited. Both are the no-op case.
	if (!found || (found.status !== 'uploaded' && found.status !== 'extracting')) return;

	const type = TYPE_BY_MIME[found.mime];
	if (!type) {
		markFailed(db, documentId, 'Compass no longer recognises this file type.');
		return;
	}

	db.update(document)
		.set({ status: 'extracting', statusDetail: null })
		.where(eq(document.id, documentId))
		.run();

	const config = getConfig();
	let outcome;
	try {
		outcome = await extract(
			absolutePathOf(found.storageKey),
			type,
			config.EXTRACT_TIMEOUT_S * 1000
		);
	} catch (problem) {
		const reason =
			problem instanceof ExtractionFailed
				? problem.reason
				: 'Something went wrong while reading this document.';
		if (!(problem instanceof ExtractionFailed)) {
			getLogger().error({ documentId, err: problem }, 'extraction failed unexpectedly');
		}
		markFailed(db, documentId, reason);
		return;
	}

	const now = new Date(clock.now());

	if (outcome.kind === 'reference_only') {
		db.update(document)
			.set({
				status: 'reference_only',
				statusDetail: outcome.reason,
				pagesExtracted: 0,
				pagesTotal: null,
				extractedAt: now
			})
			.where(eq(document.id, documentId))
			.run();
		return;
	}

	const partial = outcome.pagesExtracted < outcome.pagesTotal;

	db.transaction((tx) => {
		// Wholesale replacement, so an interrupted earlier run leaves no prefix
		// mixed into this one.
		tx.delete(passage).where(eq(passage.documentId, documentId)).run();
		for (const item of outcome.passages) {
			tx.insert(passage)
				.values({
					id: newId(),
					documentId,
					page: item.page,
					ordinal: item.ordinal,
					text: item.text,
					textHash: createHash('sha256').update(item.text).digest('hex'),
					bbox: null
				})
				.run();
		}
		tx.update(document)
			.set({
				status: 'extracted',
				// Reported, never silently dropped: a community must not believe
				// Compass read all of a document it read three-quarters of.
				statusDetail: partial
					? `Read ${outcome.pagesExtracted} of ${outcome.pagesTotal} pages — the rest are past the ${config.MAX_EXTRACT_PAGES}-page limit and were not extracted.`
					: null,
				pagesExtracted: outcome.pagesExtracted,
				pagesTotal: outcome.pagesTotal,
				extractedAt: now
			})
			.where(eq(document.id, documentId))
			.run();
	});
}

function markFailed(db: Db, documentId: string, reason: string): void {
	db.update(document)
		.set({ status: 'failed', statusDetail: reason })
		.where(eq(document.id, documentId))
		.run();
}

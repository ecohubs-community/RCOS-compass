import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import { getConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { document, passage } from '../db/schema/documents.js';
import { getLogger } from '../logger.js';
import { staleEvidenceForDocument } from '../services/evidence.js';
import { indexDocument, removeDocumentFromIndex } from '../services/search.js';
import {
	extract,
	ExtractionFailed,
	ExtractionUnavailable,
	EXTRACTOR_VERSION,
	type ExtractedPassage
} from './extract.js';
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
 *
 * Since documents can be read more than once (`reread.ts`), **every** verdict
 * replaces the previous reading, not only success: a document that is now
 * `failed` or `reference_only` must not keep last reading's passages, search
 * rows and live evidence under a status that says there is no text. The one
 * outcome that replaces nothing is `ExtractionUnavailable` — the reading was
 * never attempted, so there is no new verdict to record.
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
		recordReading(db, clock, found, {
			status: 'failed',
			detail: 'Compass no longer recognises this file type.'
		});
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
		if (problem instanceof ExtractionUnavailable) {
			getLogger().error({ documentId, err: problem }, 'extraction could not be attempted');
			keepEarlierReading(db, found);
			return;
		}
		const reason =
			problem instanceof ExtractionFailed
				? problem.reason
				: 'Something went wrong while reading this document.';
		if (!(problem instanceof ExtractionFailed)) {
			getLogger().error({ documentId, err: problem }, 'extraction failed unexpectedly');
		}
		recordReading(db, clock, found, { status: 'failed', detail: reason });
		return;
	}

	if (outcome.kind === 'reference_only') {
		recordReading(db, clock, found, { status: 'reference_only', detail: outcome.reason });
		return;
	}

	const partial = outcome.pagesExtracted < outcome.pagesTotal;
	recordReading(db, clock, found, {
		status: 'extracted',
		// Reported, never silently dropped: a community must not believe Compass
		// read all of a document it read three-quarters of.
		detail: partial
			? `Read ${outcome.pagesExtracted} of ${outcome.pagesTotal} pages — the rest are past the ${config.MAX_EXTRACT_PAGES}-page limit and were not extracted.`
			: null,
		passages: outcome.passages,
		pagesExtracted: outcome.pagesExtracted,
		pagesTotal: outcome.pagesTotal
	});
}

/** Rows per multi-row passage insert, well inside SQLite's variable limit. */
const INSERT_CHUNK = 200;

/**
 * Replace whatever reading the document had with this verdict, in one
 * transaction.
 *
 * Evidence pointing at the passages about to go is staled *first* — deleting
 * them would otherwise leave claims neither stale nor pointing anywhere, the
 * state the evidence spec forbids. The index rows go next, while the passage
 * ids they are addressed by still exist to look up.
 */
function recordReading(
	db: Db,
	clock: Clock,
	found: { id: string; communityId: string },
	verdict: {
		status: 'extracted' | 'reference_only' | 'failed';
		detail: string | null;
		passages?: ExtractedPassage[];
		pagesExtracted?: number;
		pagesTotal?: number;
	}
): void {
	const now = new Date(clock.now());
	const passages = verdict.passages ?? [];

	db.transaction((tx) => {
		const t = tx as unknown as Db;
		staleEvidenceForDocument(t, found.id);
		removeDocumentFromIndex(t, found.communityId, found.id);
		tx.delete(passage).where(eq(passage.documentId, found.id)).run();

		for (let at = 0; at < passages.length; at += INSERT_CHUNK) {
			tx.insert(passage)
				.values(
					passages.slice(at, at + INSERT_CHUNK).map((item) => ({
						id: newId(),
						documentId: found.id,
						page: item.page,
						ordinal: item.ordinal,
						kind: item.kind,
						text: item.text,
						textHash: createHash('sha256').update(item.text).digest('hex'),
						bbox: item.bbox === null ? null : JSON.stringify(item.bbox)
					}))
				)
				.run();
		}
		if (passages.length > 0) indexDocument(t, found.communityId, found.id);

		tx.update(document)
			.set({
				status: verdict.status,
				statusDetail: verdict.detail,
				pagesExtracted: verdict.pagesExtracted ?? (verdict.status === 'failed' ? null : 0),
				pagesTotal: verdict.pagesTotal ?? null,
				// Recorded on every verdict — including failure and a scan — or the
				// re-read sweep would take the same file for an unread one at every
				// boot, forever. A verdict under this reader is final for this reader.
				extractorVersion: EXTRACTOR_VERSION,
				extractedAt: verdict.status === 'failed' ? null : now,
				// The passages were replaced: any scan claimed against the old ones
				// must write nothing more (see jobs/scan-job.ts), and nothing about the
				// old reading's scan describes the new one — no paragraph of it has been
				// read, so it is not scanned, not "Not governance", and not done.
				contentGeneration: sql`${document.contentGeneration} + 1`,
				scanStatus: 'none',
				scanDetail: null,
				scanActor: null,
				scanClaim: null,
				scanHeartbeatAt: null,
				mappingDoneAt: null,
				mappingDoneBy: null
			})
			.where(eq(document.id, found.id))
			.run();
	});
}

/**
 * The reading could not be attempted — the file is missing from the volume, a
 * parser would not load. That is a fact about the machine, not the document, so
 * nothing about the document changes: an earlier reading, if there is one, stays
 * exactly as it was (status back to `extracted`, reader version untouched, so
 * the next boot's sweep tries again), and a first upload is marked failed
 * *without* a reader version, so it is retried too rather than called damaged
 * forever.
 */
function keepEarlierReading(db: Db, found: { id: string }): void {
	const earlier = db
		.select({ id: passage.id })
		.from(passage)
		.where(eq(passage.documentId, found.id))
		.limit(1)
		.get();

	db.update(document)
		.set(
			earlier
				? { status: 'extracted', statusDetail: null }
				: {
						status: 'failed',
						statusDetail:
							'Compass could not read this document just now. The file is kept, and Compass will try again.'
					}
		)
		.where(eq(document.id, found.id))
		.run();
}

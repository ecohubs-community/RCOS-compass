import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { document } from '../db/schema/documents.js';
import { community } from '../db/schema/tenancy.js';
import { enqueue, enqueueOnce } from '../jobs/queue.js';
import type { Job } from '../db/schema/jobs.js';
import { EXTRACTOR_VERSION } from './extract.js';

/**
 * Re-reading what an older reader produced. The change's `documents` spec:
 * a document extracted by an earlier reader version, or failed under one, is
 * extracted again by the current reader without anybody asking.
 *
 * The first reader could not find a paragraph inside a PDF page, so everything
 * it produced is page-sized. No instance holds real mappings yet (confirmed by
 * the owner during the change's exploration), so this runs unconditionally;
 * evidence pointing at replaced passages goes `stale` inside extraction's own
 * transaction, exactly as the evidence spec requires.
 */

/**
 * Behind the current reader, in a community that may still change.
 *
 * Only `active` communities: a suspended community is read-only by decision
 * (`requireWritableCommunity`), and re-reading stales its evidence — a write it
 * never agreed to, in the middle of whatever the suspension is about. A deleted
 * community is waiting to be purged, and re-reading its files is work on things
 * about to be destroyed. Either is re-read if and when it becomes active again.
 */
const BEHIND = (db: Db) =>
	and(
		inArray(document.status, ['extracted', 'reference_only', 'failed']),
		or(isNull(document.extractorVersion), lt(document.extractorVersion, EXTRACTOR_VERSION)),
		inArray(
			document.communityId,
			db.select({ id: community.id }).from(community).where(eq(community.status, 'active'))
		)
	);

/**
 * Called at boot. Enqueues the one-off sweep only when something is actually
 * behind, so an instance whose documents are current enqueues nothing — and a
 * second boot after the sweep finds nothing either.
 */
export function enqueueRereadIfNeeded(db: Db, clock: Clock): Job | null {
	const behind = db.select({ id: document.id }).from(document).where(BEHIND(db)).limit(1).get();
	if (!behind) return null;
	return enqueueOnce(db, clock, { kind: 'reread-documents' });
}

/**
 * The sweep itself: reset each behind document and enqueue its extraction, in
 * one transaction. Idempotent under at-least-once delivery — a re-claimed sweep
 * finds these no longer behind (status `uploaded` is not in the selection).
 * Extraction only picks up `uploaded` documents; the reset is what hands each
 * one back to it.
 */
export function rereadBehindDocuments(db: Db, clock: Clock): { rereading: number } {
	return db.transaction((tx) => {
		const t = tx as unknown as Db;
		const behind = t.select({ id: document.id }).from(document).where(BEHIND(t)).all();

		for (const row of behind) {
			t.update(document)
				.set({ status: 'uploaded', statusDetail: null })
				.where(eq(document.id, row.id))
				.run();
			enqueue(t, clock, { kind: 'extract-document', payload: { documentId: row.id } });
		}
		return { rereading: behind.length };
	});
}

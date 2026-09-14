import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { runScanStep, SCAN_JOB, type ScanPayload, type ScanStep } from '../services/mapping.js';
import { enqueue } from './queue.js';

/**
 * One step of a document scan, and the next one queued behind it.
 *
 * A scan is a chain of short jobs rather than one long one: a thousand-paragraph
 * document is eighty-odd model calls, and one job holding the queue for all of
 * them would starve every extraction and export behind it. Each step is one
 * batch; `runScanStep` decides whether the scan goes on, and records its own
 * ending on the document whatever happens — so this handler never throws, and
 * the queue never retries a scan into a second charge.
 */
export async function runScanJob(db: Db, clock: Clock, payload: ScanPayload): Promise<ScanStep> {
	const step = await runScanStep(db, clock, payload);
	if (step.outcome === 'continued') {
		enqueue(db, clock, { kind: SCAN_JOB, payload, maxAttempts: 1 });
	}
	return step;
}

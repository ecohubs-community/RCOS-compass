import { eq } from 'drizzle-orm';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import type { Clock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { document, passage } from '../../src/lib/server/db/schema/documents.js';
import { runScanStep, startScan, type ScanPayload } from '../../src/lib/server/services/mapping.js';

/**
 * Start a scan and drive it to its end, the way the job chain would — without a
 * worker, so a test reads as the member's act and its outcome.
 *
 * Returns the same totals the old awaited run reported, gathered from the steps
 * and the document: what was suggested, discarded and read, where it stopped,
 * and how many paragraphs are still unread.
 */
export async function scanToEnd(
	ctx: Ctx,
	documentId: string,
	options: { db: Db; clock?: Clock; maxSteps?: number }
) {
	const { db } = options;
	const clock = options.clock ?? { now: ctx.now };
	const started = startScan(ctx, documentId, { db });

	const found = db.select().from(document).where(eq(document.id, documentId)).get()!;
	const payload: ScanPayload = {
		communityId: ctx.community.id,
		documentId,
		actorId: ctx.user.id,
		generation: found.contentGeneration
	};

	const totals = { queued: started.queued, suggested: 0, discarded: 0, read: 0, steps: 0 };
	let outcome: Awaited<ReturnType<typeof runScanStep>>['outcome'] = 'continued';
	while (started.queued && outcome === 'continued' && totals.steps < (options.maxSteps ?? 500)) {
		const step = await runScanStep(db, clock, payload);
		outcome = step.outcome;
		totals.suggested += step.suggested;
		totals.discarded += step.discarded;
		totals.read += step.read;
		totals.steps += 1;
	}

	const after = db.select().from(document).where(eq(document.id, documentId)).get()!;
	const unread = db
		.select()
		.from(passage)
		.where(eq(passage.documentId, documentId))
		.all()
		.filter((row) => row.kind === 'paragraph' && row.scannedAt === null).length;

	return {
		...totals,
		outcome,
		scanStatus: after.scanStatus,
		stoppedBecause: after.scanStatus === 'stopped' ? after.scanDetail : null,
		unread
	};
}

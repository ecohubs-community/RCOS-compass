import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { asSignedIn } from '../auth/audience.js';
import type { Ctx } from '../auth/guard.js';
import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { producedFile } from '../db/schema/self-audit.js';
import { community, membership } from '../db/schema/tenancy.js';
import { user } from '../db/schema/auth.js';
import { absolutePathOf, removeFile } from '../documents/storage.js';
import { buildBundle, expiredFiles, recordBundle } from '../services/export.js';
import { renderPdf } from '../services/export-pdf.js';
import { renderArtifact } from '../services/render-artifact.js';
import { standardViewFor } from '../services/completeness.js';
import { notify } from '../services/notifications.js';
import { reached } from '../services/funnel.js';

/**
 * Building the bundle, off the request.
 *
 * A community's whole governance is small, so this is fast — but it is a job
 * because the request that asks for it should return immediately and because a
 * download needs somewhere to live. `docs/00` §9 states the export as a product
 * promise; a promise that ties up a request thread is one that stops being kept
 * on the day a community grows.
 */
export type ExportPayload = { communityId: string; actorId: string };

export async function runExport(db: Db, payload: ExportPayload, now: number): Promise<void> {
	const home = db.select().from(community).where(eq(community.id, payload.communityId)).get();
	// Gone since it was queued — a community deleted between the request and the
	// worker picking it up. Nothing to export and nobody to tell.
	if (!home) return;

	const actor = db.select().from(user).where(eq(user.id, payload.actorId)).get();
	const seat = db
		.select()
		.from(membership)
		.where(eq(membership.userId, payload.actorId))
		.all()
		.find((row) => row.communityId === home.id);
	if (!actor || !seat) return;

	// The audience is the person who asked, so the bundle contains what *they*
	// could see and the manifest says which levels those were.
	const ctx = { user: actor, community: home, membership: seat, now: () => now } as Ctx;
	// The PDF first, because it may not be available and the bundle's manifest
	// has to say which. A missing browser is an operational fact rather than a
	// failure: the Markdown and JSON are the promise.
	const standard = standardViewFor(db, home.id);
	const rendered = standard
		? standard.view.artifacts
				.map((artifact) => renderArtifact(db, asSignedIn(ctx), artifact.key))
				.filter((one) => one !== null)
		: [];
	const pdf = await renderPdf(rendered, home.name);

	const built = buildBundle(db, asSignedIn(ctx), now, { pdf });

	const storageKey = `${home.id}/exports/${newId()}.zip`;
	const path = absolutePathOf(storageKey);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, built.bytes);

	const record = recordBundle(db, ctx, built, storageKey);
	reached(db, home.id, 'export.first', now);

	notify(db, ctx, {
		kind: 'export.ready',
		subjectType: 'export',
		subjectId: record.id,
		summary: `Your export of ${home.name} is ready`,
		recipients: [seat.id],
		// The export is the job's outcome, not the member's act: without this
		// the only recipient is filtered out as "the author" and nothing is written.
		includeActor: true
	});
}

/**
 * Remove bundles past their date, and their rows with them.
 *
 * A produced file that outlives its record is an orphan on the disk; a record
 * that outlives its file is a download that 404s. Both directions are removed
 * together, and the file first — a crash between the two leaves a row pointing
 * at nothing, which the download path already treats as gone.
 */
export async function cleanUpExports(db: Db, now: number): Promise<{ removed: number }> {
	const due = expiredFiles(db, now);
	for (const row of due) {
		await removeFile(row.storageKey);
		db.delete(producedFile).where(eq(producedFile.id, row.id)).run();
	}
	return { removed: due.length };
}

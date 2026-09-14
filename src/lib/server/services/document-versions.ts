import { and, desc, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import type { Reader } from '../auth/audience.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import {
	document,
	documentFileVersion,
	passage,
	type DocumentFileVersion
} from '../db/schema/documents.js';
import { MIME } from '../documents/sniff.js';
import { removeFile, type StoredFile } from '../documents/storage.js';
import { enqueue } from '../jobs/queue.js';
import { getDocument, uploadRefusal } from './documents.js';
import { staleEvidenceForDocument } from './evidence.js';
import { registerTenantService } from './registry.js';
import { removeDocumentFromIndex } from './search.js';

/**
 * A document's file, replaced — and the files it replaced, kept.
 * The change's `documents` spec: "A document's file can be replaced, and the
 * previous file is kept".
 *
 * Any member who may upload may replace or restore, because keeping the earlier
 * file is what makes that safe: a mistaken or harmful replacement is one
 * "Restore" away, and only a steward can delete a version for good.
 *
 * The `document` row always describes the *current* file, so every existing
 * read path — extraction, search, the file route — works unchanged; versions are
 * a list nobody reads unless they ask. A replacement is otherwise a fresh
 * reading of the same document: evidence on the old passages goes stale (and
 * can be re-confirmed where the words survive), the scan and "mapping done"
 * reset, and the content generation moves so a scan mid-flight writes nothing.
 */

/** Everything about the current file that becomes a version, and the resets of a new reading. */
function newReading(now: Date) {
	return {
		status: 'uploaded' as const,
		statusDetail: null,
		pagesExtracted: null,
		pagesTotal: null,
		extractorVersion: null,
		extractedAt: null,
		contentGeneration: sql`${document.contentGeneration} + 1`,
		scanStatus: 'none' as const,
		scanDetail: null,
		scanActor: null,
		scanHeartbeatAt: null,
		mappingDoneAt: null,
		mappingDoneBy: null,
		uploadedAt: now
	};
}

/** Clear the old reading inside the caller's transaction: stale claims, index rows, passages. */
function forgetReading(db: Db, communityId: string, documentId: string): void {
	staleEvidenceForDocument(db, documentId);
	removeDocumentFromIndex(db, communityId, documentId);
	db.delete(passage).where(eq(passage.documentId, documentId)).run();
}

/**
 * Put a newer file in place of the current one.
 *
 * The file has already passed the upload envelope (`receiveUpload`). It is
 * moved into place *before* the rows change, and removed again if they cannot:
 * a row pointing at a missing file is a broken document, a file nothing points
 * at is only an orphan the purge sweep removes.
 */
export async function replaceDocument(
	ctx: Ctx,
	documentId: string,
	input: { filename: string; file: StoredFile },
	options: { db?: Db } = {}
): Promise<void> {
	requirePermission(ctx, 'document.upload');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const { file } = input;

	let found;
	try {
		found = getDocument(ctx, documentId, { db });
		if (file.sha256 === found.sha256) {
			error(409, 'This is the same file as the one already here.');
		}
	} catch (problem) {
		await file.discard();
		throw problem;
	}

	await file.commit();
	const now = new Date(ctx.now());

	try {
		db.transaction((tx) => {
			const t = tx as unknown as Db;
			// Inside the write, like an upload: a replacement is an upload for the
			// rate limits, and the kept version is why storage grows.
			const refusal = uploadRefusal(ctx, file.bytes, { db: t });
			if (refusal) error(409, refusal);

			t.insert(documentFileVersion)
				.values({
					id: newId(),
					documentId: found.id,
					communityId: ctx.community.id,
					filename: found.filename,
					mime: found.mime,
					bytes: found.bytes,
					sha256: found.sha256,
					storageKey: found.storageKey,
					uploadedBy: found.uploadedBy,
					uploadedAt: found.uploadedAt,
					supersededBy: ctx.user.id,
					supersededAt: now
				})
				.run();

			forgetReading(t, ctx.community.id, found.id);

			t.update(document)
				.set({
					...newReading(now),
					filename: input.filename,
					mime: MIME[file.type],
					bytes: file.bytes,
					sha256: file.sha256,
					storageKey: file.storageKey,
					uploadedBy: ctx.user.id
				})
				.where(and(eq(document.id, found.id), eq(document.communityId, ctx.community.id)))
				.run();

			enqueue(t, { now: ctx.now }, { kind: 'extract-document', payload: { documentId: found.id } });
		});
	} catch (problem) {
		await removeFile(file.storageKey);
		throw problem;
	}
}

/**
 * Bring an earlier file back. A replacement by that version's file: the current
 * file becomes a version, the restored row is removed, and no bytes are copied —
 * the storage total is exactly what it was.
 */
export function restoreVersion(
	ctx: Ctx,
	documentId: string,
	versionId: string,
	options: { db?: Db } = {}
): void {
	requirePermission(ctx, 'document.upload');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const found = getDocument(ctx, documentId, { db });
	const version = findVersion(db, ctx, found.id, versionId);
	const now = new Date(ctx.now());

	db.transaction((tx) => {
		const t = tx as unknown as Db;
		t.insert(documentFileVersion)
			.values({
				id: newId(),
				documentId: found.id,
				communityId: ctx.community.id,
				filename: found.filename,
				mime: found.mime,
				bytes: found.bytes,
				sha256: found.sha256,
				storageKey: found.storageKey,
				uploadedBy: found.uploadedBy,
				uploadedAt: found.uploadedAt,
				supersededBy: ctx.user.id,
				supersededAt: now
			})
			.run();
		t.delete(documentFileVersion).where(eq(documentFileVersion.id, version.id)).run();

		forgetReading(t, ctx.community.id, found.id);

		t.update(document)
			.set({
				...newReading(now),
				filename: version.filename,
				mime: version.mime,
				bytes: version.bytes,
				sha256: version.sha256,
				storageKey: version.storageKey,
				// Whoever uploaded that file uploaded it; restoring is not authorship.
				uploadedBy: version.uploadedBy,
				uploadedAt: version.uploadedAt
			})
			.where(and(eq(document.id, found.id), eq(document.communityId, ctx.community.id)))
			.run();

		enqueue(t, { now: ctx.now }, { kind: 'extract-document', payload: { documentId: found.id } });
	});
}

/** Delete an earlier file for good. A steward's act; the row first, the file after. */
export async function deleteVersion(
	ctx: Ctx,
	documentId: string,
	versionId: string,
	options: { db?: Db } = {}
): Promise<void> {
	requirePermission(ctx, 'document.destroy');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const found = getDocument(ctx, documentId, { db });
	const version = findVersion(db, ctx, found.id, versionId);
	db.delete(documentFileVersion).where(eq(documentFileVersion.id, version.id)).run();
	await removeFile(version.storageKey);
}

/** The earlier files of a document this reader may see, newest replacement first. */
export function listVersions(
	reader: Reader,
	documentId: string,
	options: { db?: Db } = {}
): DocumentFileVersion[] {
	const db = options.db ?? getDb();
	const found = getDocument(reader, documentId, { db });
	return db
		.select()
		.from(documentFileVersion)
		.where(
			and(
				eq(documentFileVersion.documentId, found.id),
				eq(documentFileVersion.communityId, found.communityId)
			)
		)
		.orderBy(desc(documentFileVersion.supersededAt))
		.all();
}

/** One version of one document, as the document's own visibility allows. */
export function getVersion(
	reader: Reader,
	documentId: string,
	versionId: string,
	options: { db?: Db } = {}
): DocumentFileVersion {
	const db = options.db ?? getDb();
	const found = getDocument(reader, documentId, { db });
	const version = db
		.select()
		.from(documentFileVersion)
		.where(
			and(
				eq(documentFileVersion.id, versionId),
				eq(documentFileVersion.documentId, found.id),
				eq(documentFileVersion.communityId, found.communityId)
			)
		)
		.get();
	if (!version) error(404, 'Not found');
	return version;
}

function findVersion(db: Db, ctx: Ctx, documentId: string, versionId: string) {
	return getVersion(ctx, documentId, versionId, { db });
}

registerTenantService({
	name: 'documentVersions.replace',
	subject: 'document',
	call: (ctx, subjectId) =>
		// The file is never reached across the boundary — the document is refused
		// first — so a stand-in that stores nothing is enough to test the refusal.
		replaceDocument(ctx, subjectId, {
			filename: 'stand-in.pdf',
			file: {
				storageKey: 'stand-in',
				type: 'pdf',
				bytes: 1,
				sha256: 'stand-in',
				discard: async () => {},
				commit: async () => {}
			}
		})
});
registerTenantService({
	name: 'documentVersions.list',
	subject: 'document',
	call: listVersions
});
registerTenantService({
	name: 'documentVersions.restore',
	subject: 'documentVersion',
	call: (ctx, subjectId) => {
		const [documentId, versionId] = subjectId.split(':');
		return restoreVersion(ctx, documentId!, versionId!);
	}
});
registerTenantService({
	name: 'documentVersions.delete',
	subject: 'documentVersion',
	call: (ctx, subjectId) => {
		const [documentId, versionId] = subjectId.split(':');
		return deleteVersion(ctx, documentId!, versionId!);
	}
});
registerTenantService({
	name: 'documentVersions.get',
	subject: 'documentVersion',
	call: (ctx, subjectId) => {
		const [documentId, versionId] = subjectId.split(':');
		return getVersion(ctx, documentId!, versionId!);
	}
});

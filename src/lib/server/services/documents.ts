import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { communityOf, type Reader } from '../auth/audience.js';
import { requireRead, visibleTo } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { getConfig } from '../config.js';
import { document, documentFileVersion, passage, type Document } from '../db/schema/documents.js';
import { MIME } from '../documents/sniff.js';
import { removeFile, type StoredFile } from '../documents/storage.js';
import { staleEvidenceForDocument } from './evidence.js';
import { removeDocumentFromIndex } from './search.js';
import { enqueue } from '../jobs/queue.js';
import { registerTenantService } from './registry.js';
import { reached } from './funnel.js';
import { documentCounts } from './mapping-counts.js';
import { canMarkDone, scanIsStalled, type MappingInput } from './mapping-state.js';

/**
 * The documents a community already had. docs/04-security.md §5.
 *
 * Two properties this module exists to hold.
 *
 * **A refused upload leaves nothing.** The file is written to a temporary path
 * by the caller and moved into place as the last act of the transaction that
 * records it, so a rejection at any point — limits, storage, a failed insert —
 * leaves no row and no file rather than half of each.
 *
 * **Every member can read what any member uploaded.** `04-security.md` §2 gives
 * every member the right to upload and to confirm mappings, and neither works if
 * documents are steward-only. The consequence is stated on the upload control
 * rather than hidden in a default: uploaded bylaws can carry names and
 * addresses, and the machinery for restricting that is P6.
 */

export function getDocument(
	reader: Reader,
	documentId: string,
	options: { db?: Db } = {}
): Document {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(document)
		.where(
			and(
				eq(document.id, documentId),
				eq(document.communityId, communityOf(audience)),
				visibleTo(audience, document.visibility)
			)
		)
		.get();

	if (!found) error(404, 'Not found');
	return found;
}

export function listDocuments(reader: Reader, options: { db?: Db } = {}): Document[] {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();
	return db
		.select()
		.from(document)
		.where(
			and(eq(document.communityId, communityOf(audience)), visibleTo(audience, document.visibility))
		)
		.orderBy(desc(document.uploadedAt))
		.all();
}

export function listPassages(reader: Reader, documentId: string, options: { db?: Db } = {}) {
	// Authorised by the document, which already applied the filter: a passage of
	// something you cannot see is something you cannot see.
	getDocument(reader, documentId, options);
	const db = options.db ?? getDb();
	return db
		.select()
		.from(passage)
		.where(eq(passage.documentId, documentId))
		.orderBy(passage.page, passage.ordinal)
		.all();
}

/**
 * Which limit, if any, this upload would pass.
 *
 * Returns the message a member should see, or null. Checked before the file is
 * moved into place and again from the caller's transaction, because the answer
 * is only meaningful at the moment of writing.
 */
export function uploadRefusal(
	ctx: Ctx,
	incomingBytes: number,
	options: { db?: Db } = {}
): string | null {
	const db = options.db ?? getDb();
	const config = getConfig();
	const now = ctx.now();

	const since = (ms: number) =>
		and(eq(document.communityId, ctx.community.id), gte(document.uploadedAt, new Date(now - ms)));

	const count = (where: ReturnType<typeof and>): number => {
		const [row] = db
			.select({ n: sql<number>`count(*)` })
			.from(document)
			.where(where)
			.all();
		return row?.n ?? 0;
	};
	/**
	 * Files this member uploaded that have since been replaced. A replacement is
	 * an upload, and the document row only carries the latest file — so every
	 * file a member put up is counted once: current files from `document`, and
	 * earlier ones from the versions they became, by who uploaded them and when.
	 */
	const earlierMine = (ms: number) => {
		const [row] = db
			.select({ n: sql<number>`count(*)` })
			.from(documentFileVersion)
			.where(
				and(
					eq(documentFileVersion.communityId, ctx.community.id),
					eq(documentFileVersion.uploadedBy, ctx.user.id),
					gte(documentFileVersion.uploadedAt, new Date(now - ms))
				)
			)
			.all();
		return row?.n ?? 0;
	};

	const mine = (ms: number) => and(since(ms), eq(document.uploadedBy, ctx.user.id));

	const HOUR = 60 * 60_000;
	const DAY = 24 * HOUR;

	if (
		config.UPLOAD_PER_USER_HOUR > 0 &&
		count(mine(HOUR)) + earlierMine(HOUR) >= config.UPLOAD_PER_USER_HOUR
	) {
		return `You have uploaded ${config.UPLOAD_PER_USER_HOUR} documents in the last hour, which is the limit. Try again shortly.`;
	}
	if (
		config.UPLOAD_PER_USER_DAY > 0 &&
		count(mine(DAY)) + earlierMine(DAY) >= config.UPLOAD_PER_USER_DAY
	) {
		return `You have uploaded ${config.UPLOAD_PER_USER_DAY} documents today, which is the limit.`;
	}
	if (config.UPLOAD_PER_COMMUNITY_DAY > 0 && count(since(DAY)) >= config.UPLOAD_PER_COMMUNITY_DAY) {
		return `This community has uploaded ${config.UPLOAD_PER_COMMUNITY_DAY} documents today, which is the limit.`;
	}

	// Earlier files are kept, so they take up room: current files and versions
	// both count toward the ceiling.
	const [stored] = db
		.select({ total: sql<number>`coalesce(sum(${document.bytes}), 0)` })
		.from(document)
		.where(eq(document.communityId, ctx.community.id))
		.all();
	const [kept] = db
		.select({ total: sql<number>`coalesce(sum(${documentFileVersion.bytes}), 0)` })
		.from(documentFileVersion)
		.where(eq(documentFileVersion.communityId, ctx.community.id))
		.all();
	const ceiling = config.STORAGE_MB * 1024 * 1024;
	if ((stored?.total ?? 0) + (kept?.total ?? 0) + incomingBytes > ceiling) {
		return `This community is storing ${config.STORAGE_MB} MB of documents and earlier versions, which is the limit. Remove a document, or ask a steward to delete old versions.`;
	}

	return null;
}

/**
 * Record an uploaded file, and move it into place as the last thing that happens.
 *
 * The file arrives already written to a temporary path and already identified
 * (`documents/storage.ts`). What is left is the part that must be all-or-nothing:
 * the limits, the row, and the move.
 */
export async function createDocument(
	ctx: Ctx,
	input: { filename: string; file: StoredFile },
	options: { db?: Db } = {}
): Promise<Document> {
	requirePermission(ctx, 'document.upload');
	requireWritableCommunity(ctx);

	const db = options.db ?? getDb();
	const now = ctx.now();
	const { file } = input;

	const id = newId();
	try {
		// The limits are checked in the same synchronous transaction as the insert:
		// checked beforehand, two uploads arriving together could each see room for
		// themselves and pass the storage ceiling between them.
		db.transaction((tx) => {
			const refusal = uploadRefusal(ctx, file.bytes, { db: tx as unknown as Db });
			if (refusal) error(409, refusal);

			tx.insert(document)
				.values({
					id,
					communityId: ctx.community.id,
					filename: input.filename,
					mime: MIME[file.type],
					bytes: file.bytes,
					sha256: file.sha256,
					storageKey: file.storageKey,
					status: 'uploaded',
					statusDetail: null,
					pagesExtracted: null,
					pagesTotal: null,
					uploadedBy: ctx.user.id,
					uploadedAt: new Date(now),
					extractedAt: null
				})
				.run();

			// Enqueued before the move: if the move then fails, the row is deleted
			// below and the handler finds nothing to do, which it treats as a no-op.
			// The other order can lose the job entirely, leaving a document that
			// says "waiting to be read" forever.
			enqueue(
				tx as unknown as Db,
				{ now: ctx.now },
				{ kind: 'extract-document', payload: { documentId: id } }
			);
		});
	} catch (problem) {
		await file.discard();
		throw problem;
	}

	try {
		// Last. A row without its file is recoverable; a file nothing references is
		// a document nobody can delete.
		await file.commit();
	} catch (problem) {
		db.delete(document).where(eq(document.id, id)).run();
		await file.discard();
		throw problem;
	}

	reached(db, ctx.community.id, 'document.uploaded', ctx.now());

	return db.select().from(document).where(eq(document.id, id)).get()!;
}

/**
 * Delete a document, its passages, and the file itself.
 *
 * A steward's act rather than a member's: removing a document invalidates other
 * people's confirmed evidence, which is why `04-security.md` §1 splits upload and
 * destroy across the two roles.
 *
 * Evidence pointing at its passages goes `stale`, not away. Each row keeps its
 * quote, its clause and whoever confirmed it — the claim the community made
 * stays readable and re-confirmable against a future upload, per the change's
 * `evidence` spec. Only the passages and the file are actually destroyed.
 */
export async function deleteDocument(
	ctx: Ctx,
	documentId: string,
	options: { db?: Db } = {}
): Promise<void> {
	requirePermission(ctx, 'document.destroy');
	requireWritableCommunity(ctx);

	const db = options.db ?? getDb();
	const found = getDocument(ctx, documentId, { db });
	// Read before the rows go: the version rows cascade with the document, and
	// their files are the part no cascade can reach.
	const versionKeys = db
		.select({ storageKey: documentFileVersion.storageKey })
		.from(documentFileVersion)
		.where(eq(documentFileVersion.documentId, documentId))
		.all()
		.map((row) => row.storageKey);

	db.transaction((tx) => {
		const scoped = tx as unknown as Db;
		// Stale first, while the passage ids still exist to find the rows by;
		// deleting the passages then nulls each survivor's passage_id via the FK.
		staleEvidenceForDocument(scoped, documentId);
		// Before the rows go: a passage is addressed in the index by its own id,
		// and the ids only exist while the rows do.
		removeDocumentFromIndex(scoped, ctx.community.id, documentId);
		tx.delete(passage).where(eq(passage.documentId, documentId)).run();
		tx.delete(document).where(eq(document.id, documentId)).run();
	});

	await removeFile(found.storageKey);
	for (const key of versionKeys) await removeFile(key);
}

/**
 * What `mapping-state.ts` needs about one document, for this reader.
 *
 * Shared by the library row, the workspace header and the two acts below, so
 * the rule that offers "Mark mapping as done" is the rule that accepts it.
 */
export function mappingInputFor(
	reader: Reader,
	found: Document,
	now: number,
	options: { db?: Db } = {}
): MappingInput {
	const counts = documentCounts(reader, found.id, options);
	return {
		status: found.status,
		scanStatus: found.scanStatus,
		scanStalled: scanIsStalled(found, now),
		identified: counts?.identified ?? 0,
		open: counts?.open ?? 0,
		doneAt: found.mappingDoneAt?.getTime() ?? null
	};
}

/**
 * "Mark mapping as done" — a member saying every passage that matters has been
 * answered, for a document no scan has read to the end.
 *
 * Accepted only where it is offered: something identified, nothing open, no
 * live scan. Refused with a sentence otherwise, because the state it would
 * claim — *Mapped* — is exactly what the library shows everybody.
 */
export function markMappingDone(ctx: Ctx, documentId: string, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const found = getDocument(ctx, documentId, { db });
	const input = mappingInputFor(ctx, found, ctx.now(), { db });
	if (!canMarkDone(input)) {
		error(
			409,
			input.open > 0
				? 'Some suggestions still need an answer before this document can be marked as done.'
				: 'This document cannot be marked as done right now.'
		);
	}

	db.update(document)
		.set({ mappingDoneAt: new Date(ctx.now()), mappingDoneBy: ctx.user.id })
		.where(and(eq(document.id, found.id), eq(document.communityId, ctx.community.id)))
		.run();
}

/** Undo "Mark mapping as done". Harmless when it was not marked. */
export function reopenMapping(ctx: Ctx, documentId: string, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const found = getDocument(ctx, documentId, { db });
	db.update(document)
		.set({ mappingDoneAt: null, mappingDoneBy: null })
		.where(and(eq(document.id, found.id), eq(document.communityId, ctx.community.id)))
		.run();
}

registerTenantService({ name: 'documents.get', subject: 'document', call: getDocument });
registerTenantService({ name: 'documents.markDone', subject: 'document', call: markMappingDone });
registerTenantService({ name: 'documents.reopen', subject: 'document', call: reopenMapping });
registerTenantService({ name: 'documents.delete', subject: 'document', call: deleteDocument });
registerTenantService({ name: 'documents.passages', subject: 'document', call: listPassages });

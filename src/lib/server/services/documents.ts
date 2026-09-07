import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { communityOf, type Reader } from '../auth/audience.js';
import { requireRead, visibleTo } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { getConfig } from '../config.js';
import { document, passage, type Document } from '../db/schema/documents.js';
import { MIME } from '../documents/sniff.js';
import { removeFile, type StoredFile } from '../documents/storage.js';
import { staleEvidenceForDocument } from './evidence.js';
import { removeDocumentFromIndex } from './search.js';
import { enqueue } from '../jobs/queue.js';
import { registerTenantService } from './registry.js';

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

	const mine = (ms: number) => and(since(ms), eq(document.uploadedBy, ctx.user.id));

	const HOUR = 60 * 60_000;
	const DAY = 24 * HOUR;

	if (config.UPLOAD_PER_USER_HOUR > 0 && count(mine(HOUR)) >= config.UPLOAD_PER_USER_HOUR) {
		return `You have uploaded ${config.UPLOAD_PER_USER_HOUR} documents in the last hour, which is the limit. Try again shortly.`;
	}
	if (config.UPLOAD_PER_USER_DAY > 0 && count(mine(DAY)) >= config.UPLOAD_PER_USER_DAY) {
		return `You have uploaded ${config.UPLOAD_PER_USER_DAY} documents today, which is the limit.`;
	}
	if (config.UPLOAD_PER_COMMUNITY_DAY > 0 && count(since(DAY)) >= config.UPLOAD_PER_COMMUNITY_DAY) {
		return `This community has uploaded ${config.UPLOAD_PER_COMMUNITY_DAY} documents today, which is the limit.`;
	}

	const [stored] = db
		.select({ total: sql<number>`coalesce(sum(${document.bytes}), 0)` })
		.from(document)
		.where(eq(document.communityId, ctx.community.id))
		.all();
	const ceiling = config.STORAGE_MB * 1024 * 1024;
	if ((stored?.total ?? 0) + incomingBytes > ceiling) {
		return `This community is storing ${config.STORAGE_MB} MB of documents, which is the limit. Remove one you no longer need.`;
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

	const refusal = uploadRefusal(ctx, file.bytes, { db });
	if (refusal) {
		await file.discard();
		error(409, refusal);
	}

	const id = newId();
	try {
		db.insert(document)
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
		// The other order can lose the job entirely, leaving a document that says
		// "waiting to be read" forever.
		enqueue(db, { now: ctx.now }, { kind: 'extract-document', payload: { documentId: id } });

		// Last. A row without its file is recoverable; a file nothing references is
		// a document nobody can delete.
		await file.commit();
	} catch (problem) {
		db.delete(document).where(eq(document.id, id)).run();
		await file.discard();
		throw problem;
	}

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
}

registerTenantService({ name: 'documents.get', subject: 'document', call: getDocument });
registerTenantService({ name: 'documents.delete', subject: 'document', call: deleteDocument });
registerTenantService({ name: 'documents.passages', subject: 'document', call: listPassages });

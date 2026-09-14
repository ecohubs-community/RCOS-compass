import { createHash } from 'node:crypto';
import type { Db } from '../../src/lib/server/db/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import {
	document,
	evidence,
	passage,
	type Document,
	type Evidence,
	type Passage
} from '../../src/lib/server/db/schema/documents.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';

/**
 * Documents, passages and claims as rows, without the upload envelope or the
 * extraction worker.
 *
 * For the suites about what happens *after* a document is read — mapping state,
 * scans, evidence acts, versions — where going through a real PDF would make
 * every test depend on the paragraph heuristics and cost a worker thread each.
 * The extraction suite is where reading is tested; this is where it is assumed.
 */
const NOW = new Date(Date.UTC(2026, 8, 14, 12, 0, 0));

export function adoptStandard(db: Db, communityId: string): string {
	const id = newId();
	db.insert(communityStandard)
		.values({
			id,
			communityId,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: NOW,
			retiredAt: null
		})
		.run();
	return id;
}

export function makeDocument(
	db: Db,
	communityId: string,
	overrides: Partial<typeof document.$inferInsert> = {}
): Document {
	const id = overrides.id ?? newId();
	db.insert(document)
		.values({
			id,
			communityId,
			filename: 'bylaws-2019.pdf',
			mime: 'application/pdf',
			bytes: 1000,
			sha256: createHash('sha256').update(id).digest('hex'),
			storageKey: `${communityId}/${id}.pdf`,
			status: 'extracted',
			pagesExtracted: 1,
			pagesTotal: 1,
			extractorVersion: 2,
			uploadedAt: NOW,
			extractedAt: NOW,
			...overrides
		})
		.run();
	return db
		.select()
		.from(document)
		.all()
		.find((row) => row.id === id)!;
}

let ordinal = 0;

export function makePassage(
	db: Db,
	documentId: string,
	overrides: Partial<typeof passage.$inferInsert> = {}
): Passage {
	const id = overrides.id ?? newId();
	const text = overrides.text ?? `Paragraph ${ordinal} of the agreements.`;
	db.insert(passage)
		.values({
			id,
			documentId,
			page: 1,
			ordinal: ordinal++,
			kind: 'paragraph',
			text,
			textHash: createHash('sha256').update(text).digest('hex'),
			bbox: null,
			...overrides
		})
		.run();
	return db
		.select()
		.from(passage)
		.all()
		.find((row) => row.id === id)!;
}

export function makeEvidence(
	db: Db,
	input: {
		communityId: string;
		communityStandardId: string;
		passage: Passage;
		clauseKey?: string;
		state?: Evidence['state'];
		suggestedBy?: Evidence['suggestedBy'];
		confirmedBy?: string | null;
		reason?: string | null;
	}
): Evidence {
	const id = newId();
	const state = input.state ?? 'suggested';
	const settled = state === 'confirmed' || state === 'dismissed';
	db.insert(evidence)
		.values({
			id,
			communityId: input.communityId,
			passageId: input.passage.id,
			documentId: input.passage.documentId,
			quote: input.passage.text,
			communityStandardId: input.communityStandardId,
			clauseKey: input.clauseKey ?? 'c-3.6.2',
			state,
			confidence: input.suggestedBy === 'human' ? null : 80,
			reason: input.reason ?? null,
			suggestedBy: input.suggestedBy ?? 'ai',
			confirmedBy: settled ? (input.confirmedBy ?? null) : null,
			confirmedAt: settled ? NOW : null,
			createdAt: NOW
		})
		.run();
	return db
		.select()
		.from(evidence)
		.all()
		.find((row) => row.id === id)!;
}

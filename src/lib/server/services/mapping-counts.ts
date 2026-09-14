import { and, eq, sql } from 'drizzle-orm';
import type { Reader } from '../auth/audience.js';
import { communityOf } from '../auth/audience.js';
import { requireRead, visibleTo } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { document } from '../db/schema/documents.js';

/**
 * The numbers `mapping-state.ts` decides from, for every document at once.
 *
 * One grouped query rather than a query per row: a library is a list, and the
 * counts are what every row shows. The visibility helper sits inside the query,
 * like every read path's, so a `restricted` document is absent from the list
 * *and* from the counts of a member who may not see it — never a row they can
 * count but not open.
 *
 * What is counted, precisely, because each word is a decision:
 * - **paragraphs** only — a heading names a topic and is never a candidate;
 * - **non-stale** evidence — a claim about a passage that is gone says nothing
 *   about the current file;
 * - **identified**: paragraphs with any such evidence, suggested or confirmed;
 * - **open**: identified paragraphs still holding a `suggested` row;
 * - **becameDefinitions**: definitions drafted from this document's evidence,
 *   through `evidence.document_id`, so they survive the passage going;
 * - **governancePages**: pages holding an identified paragraph.
 */
export type DocumentCounts = {
	documentId: string;
	paragraphs: number;
	paragraphsRead: number;
	identified: number;
	open: number;
	becameDefinitions: number;
	governancePages: number;
	versions: number;
	/** Confirmed claims on current passages — what removing the document would make stale. */
	confirmedClaims: number;
};

/**
 * The correlated subqueries name `"document"."id"` literally: drizzle renders a
 * column reference unqualified inside `sql`, and `id` is ambiguous in a
 * subquery that joins passages and evidence.
 */
function countsQuery(db: Db, where: ReturnType<typeof and>) {
	return db
		.select({
			documentId: document.id,
			paragraphs: sql<number>`(
				select count(*) from passage p
				where p.document_id = "document"."id" and p.kind = 'paragraph'
			)`,
			paragraphsRead: sql<number>`(
				select count(*) from passage p
				where p.document_id = "document"."id" and p.kind = 'paragraph' and p.scanned_at is not null
			)`,
			identified: sql<number>`(
				select count(distinct p.id) from passage p
				join evidence e on e.passage_id = p.id and e.state <> 'stale'
				where p.document_id = "document"."id" and p.kind = 'paragraph'
			)`,
			open: sql<number>`(
				select count(distinct p.id) from passage p
				join evidence e on e.passage_id = p.id and e.state = 'suggested'
				where p.document_id = "document"."id" and p.kind = 'paragraph'
			)`,
			becameDefinitions: sql<number>`(
				select count(distinct s.definition_id) from definition_source s
				join evidence e on e.id = s.evidence_id
				where e.document_id = "document"."id"
			)`,
			governancePages: sql<number>`(
				select count(distinct p.page) from passage p
				join evidence e on e.passage_id = p.id and e.state <> 'stale'
				where p.document_id = "document"."id" and p.kind = 'paragraph'
			)`,
			confirmedClaims: sql<number>`(
				select count(*) from evidence e
				join passage p on p.id = e.passage_id
				where p.document_id = "document"."id" and e.state = 'confirmed'
			)`,
			versions: sql<number>`(
				select count(*) from document_file_version v where v.document_id = "document"."id"
			)`
		})
		.from(document)
		.where(where)
		.all();
}

/** Counts for every document this reader may see in their community. */
export function libraryCounts(
	reader: Reader,
	options: { db?: Db } = {}
): Map<string, DocumentCounts> {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();
	const rows = countsQuery(
		db,
		and(eq(document.communityId, communityOf(audience)), visibleTo(audience, document.visibility))
	);
	return new Map(rows.map((row) => [row.documentId, row]));
}

/**
 * Counts for one document. Null when it is not there for this reader — the
 * caller has already answered 404 through `getDocument`, so this never decides
 * visibility on its own.
 */
export function documentCounts(
	reader: Reader,
	documentId: string,
	options: { db?: Db } = {}
): DocumentCounts | null {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();
	return (
		countsQuery(
			db,
			and(
				eq(document.id, documentId),
				eq(document.communityId, communityOf(audience)),
				visibleTo(audience, document.visibility)
			)
		)[0] ?? null
	);
}

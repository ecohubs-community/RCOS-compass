import { sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { termsOf } from './stop-words.js';
import type { SearchDoc, SearchHit, Searchable, SearchIndex } from './types.js';

/**
 * The one file that knows search is FTS5. `docs/00-architecture.md` §5.
 *
 * That document forbids raw SQL outside the database layer and names full-text
 * search as the exception that lives behind an interface, one file per engine.
 * This is that file, and an ESLint rule keeps FTS5's query language from
 * appearing anywhere else — the architecture doc already said this, and a rule
 * that is only written down is a rule that erodes.
 *
 * ## The community is inside the query
 *
 * `community_id` is a stored column of the virtual table and every statement
 * below filters on it. Fetching hits and narrowing them afterwards would work
 * exactly as well until the day somebody moved the filter, and then it would
 * fail silently and in the worst possible direction.
 *
 * ## What a member typed is not a query
 *
 * FTS5's `MATCH` takes an expression language: `AND`, `OR`, `NOT`, `NEAR`,
 * quotes, prefixes, column filters. A member types *"can we spend €800 on the
 * water pump?"*, which contains at least one character that language treats as
 * syntax. So the text is never handed over as an expression. It is reduced to
 * words, each quoted as a literal, joined with `OR` — the member's words are
 * looked for, and nothing they type can become an instruction.
 */

/**
 * Column weights for `bm25`, in the virtual table's column order.
 *
 * Titles above bodies, by a lot. A decision *called* "Spending authority"
 * should outrank one that merely mentions spending halfway through its
 * rationale — and indexing bodies at all is what makes the water-pump question
 * answerable, since the answer lives in the text a community adopted rather
 * than in its title. The unindexed columns take zero because they contribute no
 * tokens.
 */
const COLUMN_WEIGHTS = '0.0, 0.0, 0.0, 0.0, 8.0, 1.0';

/** Enough to fill a page of results; more is a list nobody reads. */
const DEFAULT_LIMIT = 25;

/**
 * Quote a word as an FTS5 string literal.
 *
 * Doubling the quote is the escape FTS5 defines, and it is the only escaping
 * needed: inside a quoted string, every other character is a character.
 */
const asLiteral = (term: string) => `"${term.replace(/"/g, '""')}"`;

export function fts5SearchIndex(db: Db): SearchIndex {
	const run = (statement: ReturnType<typeof sql>) => db.run(statement);

	return {
		index(communityId: string, doc: SearchDoc): void {
			// Replace rather than accumulate: re-indexing an adopted definition
			// after a new version must not leave the superseded text findable.
			this.remove(communityId, doc.subjectId);
			run(sql`
				insert into search_document (community_id, kind, subject_id, ref, title, body)
				values (${communityId}, ${doc.kind}, ${doc.subjectId}, ${doc.ref ?? ''}, ${doc.title}, ${doc.body})
			`);
		},

		remove(communityId: string, subjectId: string): void {
			run(sql`
				delete from search_document
				where community_id = ${communityId} and subject_id = ${subjectId}
			`);
		},

		clear(communityId: string): void {
			run(sql`delete from search_document where community_id = ${communityId}`);
		},

		query(communityId, text, options = {}): SearchHit[] {
			const terms = termsOf(text);
			// No words worth looking for is not an error and not an empty query —
			// handing FTS5 an empty MATCH is a syntax error, and the honest answer
			// to "search for nothing" is nothing.
			if (terms.length === 0) return [];

			const expression = terms.map(asLiteral).join(' OR ');
			const limit = options.limit ?? DEFAULT_LIMIT;
			const kinds = options.kinds;

			const rows = db.all<{
				kind: Searchable;
				subject_id: string;
				ref: string;
				title: string;
				body: string;
				rank: number;
			}>(sql`
				select
					kind, subject_id, ref, title, body,
					bm25(search_document, ${sql.raw(COLUMN_WEIGHTS)}) as rank
				from search_document
				where community_id = ${communityId}
					and search_document match ${expression}
					${kinds && kinds.length > 0 ? sql`and kind in ${kinds}` : sql``}
				order by rank
				limit ${limit}
			`);

			return rows.map((row) => ({
				kind: row.kind,
				subjectId: row.subject_id,
				ref: row.ref === '' ? null : row.ref,
				title: row.title,
				body: row.body,
				rank: row.rank
			}));
		}
	};
}

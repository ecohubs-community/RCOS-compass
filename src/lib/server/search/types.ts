/**
 * What search is, to everything that is not search. `docs/00-architecture.md` §5.
 *
 * Nothing in this type names an engine, a query language, or a table. That is
 * the whole point: FTS5 is today's answer and `tsvector` is a plausible
 * tomorrow's, and the application should not have to be rewritten to find out.
 *
 * The community is a *parameter*, not a filter applied afterwards. Every method
 * takes one, and the implementation puts it inside the query — a search that
 * fetches across communities and narrows the results is one careless refactor
 * away from not narrowing them.
 */

/** What a community wrote. Clause text is not here; see `SearchIndex`. */
export const SEARCHABLE = ['definition', 'decision', 'discussion', 'passage'] as const;
export type Searchable = (typeof SEARCHABLE)[number];

export type SearchDoc = {
	kind: Searchable;
	/** The row this stands for, so a hit can be resolved back to the thing. */
	subjectId: string;
	/** What a member would quote: `DEC-2026-014`, a clause ref, a filename. */
	ref: string | null;
	title: string;
	body: string;
};

export type SearchHit = SearchDoc & {
	/** Lower is better, as the engines have it. Never shown to a member. */
	rank: number;
};

export interface SearchIndex {
	/** Add or replace one document. Same subject id replaces, never duplicates. */
	index(communityId: string, doc: SearchDoc): void;
	/** Forget one subject. Deleting a document has to make it unfindable. */
	remove(communityId: string, subjectId: string): void;
	/** Forget everything a community has. For the rebuild, and for deletion. */
	clear(communityId: string): void;
	/**
	 * Free text in, ranked hits out.
	 *
	 * The text is whatever a member typed — a question with punctuation and an
	 * apostrophe in it — so an implementation must treat it as words to look for
	 * rather than as syntax to obey.
	 */
	query(
		communityId: string,
		text: string,
		options?: { kinds?: readonly Searchable[]; limit?: number }
	): SearchHit[];
}

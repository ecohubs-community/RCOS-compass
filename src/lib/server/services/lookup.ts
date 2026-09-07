import { and, eq, inArray } from 'drizzle-orm';
import { communityOf, type Reader } from '../auth/audience.js';
import { requireRead, visibleLevels } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { decision } from '../db/schema/decisions.js';
import { definition } from '../db/schema/definitions.js';
import { discussion } from '../db/schema/discussions.js';
import { document, passage } from '../db/schema/documents.js';
import { getSearchIndex } from '../search/index.js';
import { termsOf } from '../search/stop-words.js';
import type { Searchable, SearchHit } from '../search/types.js';
import type { Locale } from '../standard/types.js';
import { standardViewFor, answeredSections } from './completeness.js';
import { community } from '../db/schema/tenancy.js';
import type { Audience } from '../auth/audience.js';

function localeOfCommunity(db: Db, communityId: string): Locale {
	const row = db
		.select({ locale: community.locale })
		.from(community)
		.where(eq(community.id, communityId))
		.get();
	return (row?.locale ?? 'en') as Locale;
}
import { definitionsBySection } from './definitions.js';

/**
 * Reverse lookup: "can we spend €800 on the water pump?" → the rules that
 * govern it. UI spec §4.9, `design.md` §7.
 *
 * **This returns citations and never an answer.** §1.3 promises the application
 * will never tell a community what its governance should say, and the same box
 * wired to a model breaks that promise — which is why §10 puts freeform Q&A out
 * of the MVP explicitly rather than by omission. Everything below is a pointer
 * at text somebody else wrote: a clause of the standard, or a row this community
 * adopted. There is no summarisation step and nothing here composes a sentence.
 *
 * ## Two lists, not one
 *
 * Clauses are ranked by how much of the question they contain; the community's
 * own rows are ranked by the engine. Those numbers are not comparable, and
 * interleaving them would need a made-up conversion — a relevance opinion
 * presented as arithmetic. So the standard's answer and the community's answer
 * are shown as what they are: two different kinds of thing.
 */

export type ClauseCitation = {
	key: string;
	ref: string;
	layer: number;
	text: string;
	/** The section that answers it, and whether this community has. */
	sectionKey: string | null;
	sectionTitle: string | null;
	definitionId: string | null;
	answered: boolean;
	/** How many of the searched-for words appear. The whole ranking. */
	matched: number;
};

export type CommunityCitation = {
	kind: Searchable;
	subjectId: string;
	/** `DEC-2026-014`, a section key, a filename and page. What a member quotes. */
	ref: string | null;
	title: string;
	/** Their own words around the match. Quoted, never paraphrased. */
	excerpt: string;
	/**
	 * The document a passage belongs to, so the page can link to it. Null for
	 * every other kind, which is addressed by its own id.
	 *
	 * The path itself is built on the page by `links.*`, which goes through
	 * `resolve` — a route renamed here would otherwise become a 404 somebody
	 * finds in a month rather than a build failure.
	 */
	documentId: string | null;
};

export type Lookup = {
	question: string;
	/** What was actually searched for. Shown, so an empty result is legible. */
	terms: string[];
	/** Words dropped as too common to rank anything. Also shown, for the same reason. */
	ignored: string[];
	clauses: ClauseCitation[];
	ours: CommunityCitation[];
};

/** Enough context to recognise the passage, short enough to scan. */
const EXCERPT_CHARS = 240;

/**
 * The community's own words around the first match.
 *
 * A window into their text, not a précis of it. When no term is found — a title
 * matched and the body did not — it is the opening of the text, which is still
 * their sentence rather than ours.
 */
function excerptOf(body: string, terms: string[]): string {
	const text = body.replace(/\s+/g, ' ').trim();
	if (text.length <= EXCERPT_CHARS) return text;

	const lower = text.toLowerCase();
	const at = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
	const first = at.length > 0 ? Math.min(...at) : 0;

	const start = Math.max(0, first - 60);
	const end = Math.min(text.length, start + EXCERPT_CHARS);
	return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/** Clauses of the adopted standard that contain the searched-for words. */
function matchingClauses(
	db: Db,
	audience: Audience,
	terms: string[],
	limit: number
): ClauseCitation[] {
	const communityId = communityOf(audience);
	const standard = standardViewFor(db, communityId);
	if (!standard || terms.length === 0) return [];

	const locale = localeOfCommunity(db, communityId);
	const answered = answeredSections(db, standard.row.id);
	// The clause list is the published standard and is the same for everybody.
	// Which of them this community has *answered*, and with what, is not — so
	// the definitions come through the filter.
	const definitions = definitionsBySection(audience, { db });

	const scored = standard.view.clauses
		.map((clause) => {
			const text = standard.view.clauseText(clause, locale).value;
			const haystack = text.toLowerCase();
			// Whole words, so "pump" does not match "pumpkin" and, more to the
			// point, "us" does not match every word containing those letters.
			const matched = terms.filter((term) =>
				new RegExp(`(^|[^\\p{L}\\p{N}])${escapeForRegExp(term)}([^\\p{L}\\p{N}]|$)`, 'u').test(
					haystack
				)
			).length;
			return { clause, text, matched };
		})
		.filter((row) => row.matched > 0)
		// More of the question first; then the standard's own order, which is the
		// only tie-break that is not an opinion of ours.
		.sort((a, b) => b.matched - a.matched);

	return scored.slice(0, limit).map(({ clause, text, matched }) => {
		const section = clause.owner ? standard.view.section(clause.owner) : undefined;
		const adopted = clause.owner ? definitions.get(clause.owner) : undefined;
		return {
			key: clause.key,
			ref: clause.ref,
			layer: clause.layer,
			text,
			sectionKey: clause.owner,
			sectionTitle: section ? standard.view.localise(section.i18n, locale).value.title : null,
			definitionId: adopted?.adoptedVersionId ? adopted.id : null,
			answered: clause.owner ? answered.has(clause.owner) : false,
			matched
		};
	});
}

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A passage's document, which is what a member can actually open. */
function documentOf(db: Db, subjectId: string): string | null {
	const owner = db
		.select({ id: document.id })
		.from(passage)
		.innerJoin(document, eq(passage.documentId, document.id))
		.where(eq(passage.id, subjectId))
		.get();
	return owner?.id ?? null;
}

/**
 * Rows that have gone since they were indexed.
 *
 * The index is written inside the transaction that changes a row, so this
 * should always be empty. It is checked anyway: a hit resolving to a deleted
 * row is a link to a 404, and a search that hands a member a dead link is worse
 * than one that found nothing.
 */
function stillExists(db: Db, communityId: string, hits: SearchHit[]): Set<string> {
	const alive = new Set<string>();
	const idsOf = (kind: Searchable) =>
		hits.filter((hit) => hit.kind === kind).map((hit) => hit.subjectId);

	const check = <T extends { id: string }>(rows: T[]) => {
		for (const row of rows) alive.add(row.id);
	};

	const decisions = idsOf('decision');
	if (decisions.length > 0) {
		check(
			db
				.select({ id: decision.id })
				.from(decision)
				.where(and(eq(decision.communityId, communityId), inArray(decision.id, decisions)))
				.all()
		);
	}

	const definitions = idsOf('definition');
	if (definitions.length > 0) {
		check(
			db
				.select({ id: definition.id })
				.from(definition)
				.where(and(eq(definition.communityId, communityId), inArray(definition.id, definitions)))
				.all()
		);
	}

	const discussions = idsOf('discussion');
	if (discussions.length > 0) {
		check(
			db
				.select({ id: discussion.id })
				.from(discussion)
				.where(and(eq(discussion.communityId, communityId), inArray(discussion.id, discussions)))
				.all()
		);
	}

	const passages = idsOf('passage');
	if (passages.length > 0) {
		check(
			db
				.select({ id: passage.id })
				.from(passage)
				.innerJoin(document, eq(passage.documentId, document.id))
				.where(and(eq(document.communityId, communityId), inArray(passage.id, passages)))
				.all()
		);
	}

	return alive;
}

export function lookup(
	reader: Reader,
	question: string,
	options: { db?: Db; limit?: number; kinds?: readonly Searchable[] } = {}
): Lookup {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();
	const limit = options.limit ?? 20;

	const terms = termsOf(question);
	// Every word a member typed that was not searched for, so the page can say
	// so. A search that quietly drops half the question and finds nothing reads
	// as a broken feature rather than as an honest miss.
	const typed = question
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	const searched = new Set(terms);
	const ignored = [...new Set(typed.filter((word) => !searched.has(word)))];

	if (terms.length === 0) {
		return { question, terms, ignored, clauses: [], ours: [] };
	}

	const clauses = matchingClauses(db, audience, terms, limit);

	const hits = getSearchIndex(db).query(communityOf(audience), question, {
		kinds: options.kinds,
		limit,
		levels: visibleLevels(audience)
	});
	const alive = stillExists(db, communityOf(audience), hits);

	const ours = hits
		.filter((hit) => alive.has(hit.subjectId))
		.map((hit) => ({
			kind: hit.kind,
			subjectId: hit.subjectId,
			ref: hit.ref,
			title: hit.title,
			excerpt: excerptOf(hit.body, terms),
			documentId: hit.kind === 'passage' ? documentOf(db, hit.subjectId) : null
		}));

	return { question, terms, ignored, clauses, ours };
}

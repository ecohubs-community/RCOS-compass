import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { decision } from '../db/schema/decisions.js';
import { definition, definitionVersion } from '../db/schema/definitions.js';
import { discussion } from '../db/schema/discussions.js';
import { document, passage } from '../db/schema/documents.js';
import { community } from '../db/schema/tenancy.js';
import { getSearchIndex } from '../search/index.js';
import { standardViewFor } from './completeness.js';
import { communityLocale } from './community-locale.js';

/**
 * What goes into the index, and when.
 *
 * The seam in `src/lib/server/search/` knows how to store a document and
 * nothing about what a document is. This file is the other half: it knows that
 * a decision's searchable body is its proposal text, and it knows the four
 * moments that change what a community has written.
 *
 * **Every function here is called inside the transaction that caused it.** Not
 * a job — `design.md` §6: a decision that exists and is unfindable for thirty
 * seconds is a decision a member concludes did not save. Each of these is a
 * local write to a local table, the same class of work as the change-log entry
 * already in that transaction.
 *
 * That is also why they take `db` rather than reaching for `getDb()`: passed
 * the transaction handle, an index write that rolls back with its cause leaves
 * nothing behind, and one that cannot be written rolls the cause back.
 */

/** Joined into one body so a member's words match across the fields. */
const bodyOf = (...parts: (string | null | undefined)[]) =>
	parts
		.map((part) => part?.trim())
		.filter((part): part is string => Boolean(part))
		.join('\n\n');

/**
 * A definition, by the text the community adopted.
 *
 * Only the adopted version. A draft is not something the community has said,
 * and a superseded version is something it has stopped saying — indexing either
 * would answer "what did we decide about spending?" with text nobody agreed to.
 * Replacing the row rather than adding one is what makes the supersession
 * actually take effect in the index.
 */
export function indexDefinition(db: Db, communityId: string, definitionId: string): void {
	const index = getSearchIndex(db);

	const row = db
		.select()
		.from(definition)
		.where(and(eq(definition.id, definitionId), eq(definition.communityId, communityId)))
		.get();
	if (!row?.adoptedVersionId) {
		index.remove(communityId, definitionId);
		return;
	}

	const version = db
		.select()
		.from(definitionVersion)
		.where(eq(definitionVersion.id, row.adoptedVersionId))
		.get();
	if (!version) {
		index.remove(communityId, definitionId);
		return;
	}

	index.index(communityId, {
		kind: 'definition',
		subjectId: row.id,
		ref: row.sectionKey,
		title: definitionTitle(db, communityId, row),
		body: bodyOf(version.body, version.plainLanguage, row.purpose),
		visibility: row.visibility
	});
}

/**
 * What a member would call this definition.
 *
 * A local definition names itself. A standard one takes the section's title, in
 * the community's own locale — "Ausgabenbefugnis" is what a German community
 * would type, and the section key would match nothing anybody says out loud.
 */
function definitionTitle(db: Db, communityId: string, row: typeof definition.$inferSelect): string {
	if (row.title) return row.title;
	if (!row.sectionKey) return '';

	const standard = standardViewFor(db, communityId);
	const section = standard?.view.section(row.sectionKey);
	if (!section) return row.sectionKey;

	return standard!.view.localise(section.i18n, communityLocale(db, communityId)).value.title;
}

/**
 * A decision, by the text it froze.
 *
 * `proposal_text` is indexed and not only the title, decided in `design.md`:
 * the water-pump question is answered by *"any spend over €500 needs a consent
 * decision"*, and a title reading "Spending authority" matches nothing a member
 * types. The cost is a noisier ranking, paid for by weighting titles above
 * bodies in the engine.
 */
export function indexDecision(db: Db, communityId: string, decisionId: string): void {
	const row = db
		.select()
		.from(decision)
		.where(and(eq(decision.id, decisionId), eq(decision.communityId, communityId)))
		.get();
	if (!row) return;

	getSearchIndex(db).index(communityId, {
		kind: 'decision',
		subjectId: row.id,
		ref: row.ref,
		title: row.title,
		body: bodyOf(row.proposalText, row.rationale),
		visibility: row.visibility
	});
}

/**
 * A discussion, by its title.
 *
 * Posts are not indexed. A thread is findable so a member can reach the
 * conversation; what the conversation *concluded* is the decision, and putting
 * every post in the index would rank half-formed arguments beside the rule the
 * community actually adopted.
 */
export function indexDiscussion(db: Db, communityId: string, discussionId: string): void {
	const row = db
		.select()
		.from(discussion)
		.where(and(eq(discussion.id, discussionId), eq(discussion.communityId, communityId)))
		.get();
	if (!row) return;

	getSearchIndex(db).index(communityId, {
		kind: 'discussion',
		subjectId: row.id,
		ref: row.clauseKey,
		title: row.title,
		body: '',
		// Always member-visible: a discussion is the working conversation, not
		// something a community publishes. Nothing sets a visibility on it, so
		// nothing can accidentally publish one either.
		visibility: 'member'
	});
}

/** Every passage of one document, replacing whatever was there before. */
export function indexDocument(db: Db, communityId: string, documentId: string): void {
	const index = getSearchIndex(db);
	const file = db
		.select()
		.from(document)
		.where(and(eq(document.id, documentId), eq(document.communityId, communityId)))
		.get();
	if (!file) return;

	index.indexMany(
		communityId,
		db
			.select()
			.from(passage)
			.where(eq(passage.documentId, documentId))
			.all()
			.map((item) => ({
				kind: 'passage' as const,
				subjectId: item.id,
				ref: `${file.filename} p.${item.page}`,
				title: file.filename,
				body: item.text,
				// A passage is as visible as the document it came out of, and no more.
				visibility: file.visibility
			}))
	);
}

/**
 * Forget a document's passages.
 *
 * Read before the rows go, because a passage is addressed in the index by its
 * own id and the ids only exist while the rows do. Destroying a document has to
 * make its text unfindable — evidence keeps its quote, which is a claim the
 * community made, but the document's own text is gone and search must agree.
 */
export function removeDocumentFromIndex(db: Db, communityId: string, documentId: string): void {
	getSearchIndex(db).removeMany(
		communityId,
		db
			.select({ id: passage.id })
			.from(passage)
			.where(eq(passage.documentId, documentId))
			.all()
			.map((item) => item.id)
	);
}

/**
 * Build one community's index from the rows, from nothing.
 *
 * Idempotent, because it clears first: the deploy step is migrate, rebuild,
 * serve, and a rebuild that ran twice would otherwise double every document.
 * It exists for two reasons — the first deploy, where the index is empty and
 * the rows are not, and drift, which after §6 means a bug rather than a race
 * and is therefore something somebody will need to recover from at least once.
 */
export function rebuildSearchIndex(db: Db, communityId: string): { indexed: number } {
	getSearchIndex(db).clear(communityId);
	let indexed = 0;

	for (const row of db
		.select({ id: definition.id })
		.from(definition)
		.where(eq(definition.communityId, communityId))
		.all()) {
		indexDefinition(db, communityId, row.id);
		indexed += 1;
	}

	for (const row of db
		.select({ id: decision.id })
		.from(decision)
		.where(eq(decision.communityId, communityId))
		.all()) {
		indexDecision(db, communityId, row.id);
		indexed += 1;
	}

	for (const row of db
		.select({ id: discussion.id })
		.from(discussion)
		.where(eq(discussion.communityId, communityId))
		.all()) {
		indexDiscussion(db, communityId, row.id);
		indexed += 1;
	}

	for (const row of db
		.select({ id: document.id })
		.from(document)
		.where(eq(document.communityId, communityId))
		.all()) {
		indexDocument(db, communityId, row.id);
		indexed += 1;
	}

	return { indexed };
}

/** Every community, for the deploy step. */
export function rebuildAllSearchIndexes(db: Db): { communities: number; indexed: number } {
	const communities = db.select({ id: community.id }).from(community).all();
	let indexed = 0;
	for (const row of communities) indexed += rebuildSearchIndex(db, row.id).indexed;
	return { communities: communities.length, indexed };
}

/** The passages of documents a community owns — the tenant check for passage hits. */
export function passagesOwnedBy(db: Db, communityId: string, ids: string[]): Set<string> {
	if (ids.length === 0) return new Set();
	const rows = db
		.select({ id: passage.id })
		.from(passage)
		.innerJoin(document, eq(passage.documentId, document.id))
		.where(and(eq(document.communityId, communityId), inArray(passage.id, ids)))
		.all();
	return new Set(rows.map((row) => row.id));
}

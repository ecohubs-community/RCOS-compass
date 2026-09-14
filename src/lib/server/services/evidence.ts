import { createHash } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import {
	definitionSource,
	document,
	evidence,
	passage,
	type Evidence
} from '../db/schema/documents.js';
import { definition, definitionDraft } from '../db/schema/definitions.js';
import { activeStandardView } from './completeness.js';
import { getDefinition } from './definitions.js';
import { getDocument } from './documents.js';
import { newEditToken } from './definitions.js';
import { addProposal, openDiscussion } from './discussions.js';
import { registerTenantService } from './registry.js';
import { reached } from './funnel.js';

/**
 * "We have language about this." UI spec §4.5, the change's `evidence` spec.
 *
 * The two lines this module holds:
 *
 * **Confirming is a human act.** A person maps a passage, or a person confirms a
 * suggestion; a model only ever produces `suggested`. The schema's own check
 * makes a confirmed row without a confirmer unstorable, and this service is the
 * only writer.
 *
 * **Evidence moves no number.** Nothing here touches `clause_coverage` or any
 * definition's adopted state. The way a community's own words become binding is
 * `turnIntoDefinition`, which produces a *draft* — and a draft enters the same
 * discuss-propose-freeze loop as text typed from nothing.
 */

/** A passage in the caller's community, or nothing. */
function passageInCommunity(db: Db, ctx: Ctx, passageId: string) {
	const found = db
		.select({ passage })
		.from(passage)
		.innerJoin(document, eq(document.id, passage.documentId))
		.where(and(eq(passage.id, passageId), eq(document.communityId, ctx.community.id)))
		.get();
	if (!found) error(404, 'Not found');
	return found.passage;
}

export function getEvidence(ctx: Ctx, evidenceId: string, options: { db?: Db } = {}): Evidence {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(evidence)
		.where(and(eq(evidence.id, evidenceId), eq(evidence.communityId, ctx.community.id)))
		.get();
	if (!found) error(404, 'Not found');
	return found;
}

/**
 * Resolve a clause however the member named it — the stable key, or the
 * reference the standard browser shows them — and refuse one that is in neither.
 * The same rule discussions follow, for the same reason: members type what they
 * can see.
 */
export function resolveClause(db: Db, ctx: Ctx, typed: string) {
	const standard = activeStandardView(db, ctx);
	if (!standard) error(409, 'This community has not adopted a standard yet.');

	const clause = standard.view.clause(typed.trim()) ?? standard.view.clauseByRef(typed.trim());
	if (!clause) {
		error(400, `There is no clause ${typed.trim()} in the standard this community adopted.`);
	}
	return { standard, clause };
}

/**
 * A member maps a passage to a clause themselves — the path that makes the AI
 * optional, and the one the exit criteria run on.
 *
 * Upserted against the (passage, clause) pair: re-mapping something dismissed or
 * stale is re-confirming it, not filing a duplicate claim beside it.
 */
export function mapPassage(
	ctx: Ctx,
	input: { passageId: string; clause: string; excerpt?: { start: number; end: number } | null },
	options: { db?: Db } = {}
): Evidence {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();

	const found = passageInCommunity(db, ctx, input.passageId);
	// A heading names what the paragraphs under it are about; it answers no
	// clause itself. Refused rather than hidden, so a crafted form cannot do it.
	if (found.kind === 'heading') {
		error(400, 'A heading is not mapped to a clause. Map the paragraph under it.');
	}
	const { standard, clause } = resolveClause(db, ctx, input.clause);
	const excerpt = input.excerpt ?? null;
	if (excerpt && !validExcerpt(excerpt, found.text)) {
		error(
			400,
			'That selection is not part of this passage. Select words inside it, or map it whole.'
		);
	}

	const id = newId();
	db.insert(evidence)
		.values({
			id,
			communityId: ctx.community.id,
			passageId: found.id,
			documentId: found.documentId,
			quote: found.text,
			excerptStart: excerpt?.start ?? null,
			excerptEnd: excerpt?.end ?? null,
			communityStandardId: standard.row.id,
			clauseKey: clause.key,
			state: 'confirmed',
			confidence: null,
			suggestedBy: 'human',
			confirmedBy: ctx.user.id,
			confirmedAt: new Date(now),
			createdAt: new Date(now)
		})
		.onConflictDoUpdate({
			target: [evidence.communityId, evidence.passageId, evidence.clauseKey],
			set: {
				state: 'confirmed',
				confirmedBy: ctx.user.id,
				confirmedAt: new Date(now),
				...(excerpt ? { excerptStart: excerpt.start, excerptEnd: excerpt.end } : {})
			}
		})
		.run();

	return db
		.select()
		.from(evidence)
		.where(
			and(
				eq(evidence.communityId, ctx.community.id),
				eq(evidence.passageId, found.id),
				eq(evidence.clauseKey, clause.key)
			)
		)
		.get()!;
}

/** An excerpt range lies inside the passage it claims to be part of. */
function validExcerpt(range: { start: number; end: number }, text: string): boolean {
	return (
		Number.isInteger(range.start) &&
		Number.isInteger(range.end) &&
		range.start >= 0 &&
		range.start < range.end &&
		range.end <= text.length
	);
}

/**
 * A person answers a suggestion with a different clause — "not §3.3.2, §3.6.2".
 *
 * One transaction, two acts that belong together: the model's pairing is
 * dismissed (and stays on record as the thing a person corrected), and the
 * clause the person chose is confirmed for the same passage. An existing row for
 * that pairing is reused whatever its state — the (passage, clause) pair is
 * unique, and a second row beside a dismissed one would be a duplicate claim.
 */
export function changeClause(
	ctx: Ctx,
	evidenceId: string,
	clauseTyped: string,
	options: { db?: Db } = {}
): Evidence {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	const found = getEvidence(ctx, evidenceId, { db });
	if (found.passageId === null) {
		error(409, 'The passage behind this evidence is gone; there is nothing left to answer.');
	}
	const { standard, clause } = resolveClause(db, ctx, clauseTyped);
	if (clause.key === found.clauseKey) return confirmEvidence(ctx, evidenceId, { db });

	return db.transaction((tx) => {
		tx.update(evidence)
			.set({ state: 'dismissed', confirmedBy: ctx.user.id, confirmedAt: now })
			.where(eq(evidence.id, found.id))
			.run();

		tx.insert(evidence)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				passageId: found.passageId,
				documentId: found.documentId,
				quote: found.quote,
				excerptStart: found.excerptStart,
				excerptEnd: found.excerptEnd,
				communityStandardId: standard.row.id,
				clauseKey: clause.key,
				state: 'confirmed',
				confidence: null,
				reason: null,
				suggestedBy: 'human',
				confirmedBy: ctx.user.id,
				confirmedAt: now,
				createdAt: now
			})
			.onConflictDoUpdate({
				target: [evidence.communityId, evidence.passageId, evidence.clauseKey],
				set: { state: 'confirmed', confirmedBy: ctx.user.id, confirmedAt: now }
			})
			.run();

		reached(tx as unknown as Db, ctx.community.id, 'mapping.confirmed', ctx.now());
		return tx
			.select()
			.from(evidence)
			.where(
				and(
					eq(evidence.communityId, ctx.community.id),
					eq(evidence.passageId, found.passageId!),
					eq(evidence.clauseKey, clause.key)
				)
			)
			.get()!;
	});
}

/**
 * "Not governance" — every open suggestion on a passage dismissed at once.
 *
 * Confirmed claims are left exactly as they are: a member who confirmed one
 * pairing has said something, and a later "not governance" on the same passage
 * is about the model's other guesses, not about that.
 */
export function dismissPassage(ctx: Ctx, passageId: string, options: { db?: Db } = {}): number {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const found = passageInCommunity(db, ctx, passageId);
	return db
		.update(evidence)
		.set({ state: 'dismissed', confirmedBy: ctx.user.id, confirmedAt: new Date(ctx.now()) })
		.where(
			and(
				eq(evidence.communityId, ctx.community.id),
				eq(evidence.passageId, found.id),
				eq(evidence.state, 'suggested')
			)
		)
		.run().changes;
}

export type ReconfirmCandidate = {
	evidenceId: string;
	passageId: string;
	clauseKey: string;
	clauseRef: string;
	quote: string;
	confirmedBy: string | null;
	confirmedAt: number | null;
};

/**
 * Stale claims about this document whose words are still there, unchanged.
 *
 * After a replacement, restore or re-read, a claim about "A member may leave at
 * any time…" points nowhere — but if the new file says exactly that, a member
 * should be able to put the claim back with one click instead of mapping it
 * again. Matched by the hash of the quote against the current passages' text
 * hashes, within the same document only; never automatic, because a claim
 * silently re-pointed is a claim nobody re-made.
 */
export function reconfirmCandidates(
	ctx: Ctx,
	documentId: string,
	options: { db?: Db } = {}
): ReconfirmCandidate[] {
	const db = options.db ?? getDb();
	getDocument(ctx, documentId, { db });

	const stale = db
		.select()
		.from(evidence)
		.where(
			and(
				eq(evidence.communityId, ctx.community.id),
				eq(evidence.documentId, documentId),
				eq(evidence.state, 'stale')
			)
		)
		.all();
	if (stale.length === 0) return [];

	const byHash = new Map(
		db
			.select({ id: passage.id, textHash: passage.textHash })
			.from(passage)
			.where(and(eq(passage.documentId, documentId), eq(passage.kind, 'paragraph')))
			.all()
			.map((row) => [row.textHash, row.id])
	);
	const standard = activeStandardView(db, ctx);

	return stale.flatMap((row) => {
		const passageId = byHash.get(sha256(row.quote));
		if (!passageId) return [];
		return [
			{
				evidenceId: row.id,
				passageId,
				clauseKey: row.clauseKey,
				clauseRef: standard?.view.clause(row.clauseKey)?.ref ?? row.clauseKey,
				quote: row.quote,
				confirmedBy: row.confirmedBy,
				confirmedAt: row.confirmedAt?.getTime() ?? null
			}
		];
	});
}

/**
 * Put a stale claim back against the passage that still says the same thing.
 *
 * If that passage already has a row for the same clause — a scan after the
 * replacement suggested it again — that row is confirmed instead, and the stale
 * one stays stale: repointing it would collide with the unique pairing. Either
 * way a definition drafted from the old claim is pointed at the passage again,
 * so its provenance links to a page that exists.
 */
export function reconfirmStale(ctx: Ctx, evidenceId: string, options: { db?: Db } = {}): Evidence {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	const found = getEvidence(ctx, evidenceId, { db });
	if (found.state !== 'stale' || found.documentId === null) {
		error(409, 'Only a claim whose passage is gone can be re-confirmed.');
	}
	const candidate = reconfirmCandidates(ctx, found.documentId, { db }).find(
		(item) => item.evidenceId === found.id
	);
	if (!candidate) {
		error(409, 'The new file does not say this any more, so it cannot be re-confirmed as it was.');
	}

	return db.transaction((tx) => {
		const existing = tx
			.select()
			.from(evidence)
			.where(
				and(
					eq(evidence.communityId, ctx.community.id),
					eq(evidence.passageId, candidate.passageId),
					eq(evidence.clauseKey, found.clauseKey)
				)
			)
			.get();

		let confirmedId: string;
		if (existing) {
			tx.update(evidence)
				.set({ state: 'confirmed', confirmedBy: ctx.user.id, confirmedAt: now })
				.where(eq(evidence.id, existing.id))
				.run();
			confirmedId = existing.id;
		} else {
			tx.update(evidence)
				.set({
					state: 'confirmed',
					passageId: candidate.passageId,
					confirmedBy: ctx.user.id,
					confirmedAt: now
				})
				.where(eq(evidence.id, found.id))
				.run();
			confirmedId = found.id;
		}

		tx.update(definitionSource)
			.set({ passageId: candidate.passageId, evidenceId: confirmedId })
			.where(eq(definitionSource.evidenceId, found.id))
			.run();

		return tx.select().from(evidence).where(eq(evidence.id, confirmedId)).get()!;
	});
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A person agrees with a suggestion. The only road from `suggested` up. */
export function confirmEvidence(ctx: Ctx, evidenceId: string, options: { db?: Db } = {}): Evidence {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const found = getEvidence(ctx, evidenceId, { db });
	if (found.state === 'confirmed') return found;
	if (found.state === 'dismissed') {
		error(409, 'This suggestion was dismissed. Map the passage yourself to overrule that.');
	}
	if (found.passageId === null) {
		error(409, 'The passage behind this evidence is gone; there is nothing left to confirm.');
	}

	db.update(evidence)
		.set({ state: 'confirmed', confirmedBy: ctx.user.id, confirmedAt: new Date(ctx.now()) })
		.where(eq(evidence.id, evidenceId))
		.run();
	reached(db, ctx.community.id, 'mapping.confirmed', ctx.now());
	return getEvidence(ctx, evidenceId, { db });
}

/** A person says no. Recorded with their name, kept, and not offered again. */
export function dismissEvidence(ctx: Ctx, evidenceId: string, options: { db?: Db } = {}): Evidence {
	requirePermission(ctx, 'mapping.confirm');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	getEvidence(ctx, evidenceId, { db });
	db.update(evidence)
		.set({ state: 'dismissed', confirmedBy: ctx.user.id, confirmedAt: new Date(ctx.now()) })
		.where(eq(evidence.id, evidenceId))
		.run();
	return getEvidence(ctx, evidenceId, { db });
}

export type EvidenceView = Evidence & { clauseRef: string };

/** Everything claimed about one document's passages, with displayable refs. */
export function evidenceForDocument(
	ctx: Ctx,
	documentId: string,
	options: { db?: Db } = {}
): EvidenceView[] {
	const db = options.db ?? getDb();
	// Refuses first, the way every other service addressed by an id does: an
	// empty list for a foreign document is a *different* answer from the one a
	// nonexistent document gets, and a boundary that answers two ways is a
	// boundary somebody will read the difference out of.
	getDocument(ctx, documentId, { db });

	const owned = db
		.select({ id: passage.id })
		.from(passage)
		.where(eq(passage.documentId, documentId))
		.all()
		.map((row) => row.id);
	if (owned.length === 0) return [];

	const standard = activeStandardView(db, ctx);
	const refOf = (key: string) => standard?.view.clause(key)?.ref ?? key;

	return db
		.select()
		.from(evidence)
		.where(and(eq(evidence.communityId, ctx.community.id), inArray(evidence.passageId, owned)))
		.all()
		.map((row) => ({ ...row, clauseRef: refOf(row.clauseKey) }));
}

/**
 * "You already have language for N of M requirements."
 *
 * Counted over confirmed evidence on countable clauses, and shown **beside**
 * readiness, never inside it — this is the adoption-unlock number, and the one
 * number in the product that is allowed to be encouraging rather than audited.
 */
export function languageCoverage(
	ctx: Ctx,
	options: { db?: Db } = {}
): { have: number; of: number } {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const standard = activeStandardView(db, ctx);
	if (!standard) return { have: 0, of: 0 };

	const countable = new Set(standard.view.countableClauses().map((clause) => clause.key));
	const confirmed = new Set(
		db
			.select({ clauseKey: evidence.clauseKey })
			.from(evidence)
			.where(
				and(eq(evidence.communityStandardId, standard.row.id), eq(evidence.state, 'confirmed'))
			)
			.all()
			.map((row) => row.clauseKey)
			.filter((key) => countable.has(key))
	);

	return { have: confirmed.size, of: countable.size };
}

export type DefinitionMade =
	{ kind: 'draft'; definitionId: string } | { kind: 'proposal'; discussionId: string };

/**
 * The community's own words, on their way to becoming binding.
 *
 * Three cases, decided by what already exists for the clause's section:
 * no definition — create one and fill its draft; a definition whose draft is
 * still empty and unadopted — fill that; anything already written or adopted —
 * open a discussion with the passage as its first proposal, which is the P3 path
 * for changing what a community has said. Adopted text changes by decision,
 * never by upload.
 */
export function turnIntoDefinition(
	ctx: Ctx,
	evidenceId: string,
	options: { db?: Db } = {}
): DefinitionMade {
	requirePermission(ctx, 'definition.draft');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();

	const found = getEvidence(ctx, evidenceId, { db });
	if (found.state !== 'confirmed') {
		error(
			409,
			'Confirm the mapping first — a definition starts from evidence somebody stands behind.'
		);
	}

	const standard = activeStandardView(db, ctx);
	if (!standard || standard.row.id !== found.communityStandardId) {
		error(409, 'This evidence was mapped against a standard this community no longer uses.');
	}

	const clause = standard.view.clause(found.clauseKey);
	if (!clause?.owner) {
		error(409, 'That clause is not answered by a section, so there is nothing to define.');
	}
	const sectionKey = clause.owner;

	const existing = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityStandardId, standard.row.id),
				eq(definition.sectionKey, sectionKey)
			)
		)
		.get();

	const recordSource = (tx: Db, definitionId: string) => {
		tx.insert(definitionSource)
			.values({
				definitionId,
				evidenceId: found.id,
				passageId: found.passageId,
				createdAt: new Date(now)
			})
			.onConflictDoUpdate({
				target: [definitionSource.definitionId],
				set: { evidenceId: found.id, passageId: found.passageId, createdAt: new Date(now) }
			})
			.run();
	};

	if (!existing) {
		return db.transaction((tx) => {
			const id = newId();
			tx.insert(definition)
				.values({
					id,
					communityId: ctx.community.id,
					scope: 'standard',
					communityStandardId: standard.row.id,
					sectionKey,
					title: null,
					layer: clause.layer,
					purpose: null,
					attachKind: null,
					attachRcosArtifactKey: null,
					attachCommunityArtifactId: null,
					adoptedVersionId: null,
					openProposalId: null,
					reviewDueAt: null,
					provisional: false,
					createdBy: ctx.user.id,
					createdAt: new Date(now),
					updatedAt: new Date(now)
				})
				.run();
			tx.insert(definitionDraft)
				.values({
					definitionId: id,
					body: found.quote,
					plainLanguage: null,
					type: null,
					editToken: newEditToken(),
					updatedBy: ctx.user.id,
					updatedAt: new Date(now)
				})
				.run();
			recordSource(tx as unknown as Db, id);
			return { kind: 'draft', definitionId: id };
		});
	}

	const draft = db
		.select()
		.from(definitionDraft)
		.where(eq(definitionDraft.definitionId, existing.id))
		.get();

	if (!existing.adoptedVersionId && draft && draft.body.trim() === '') {
		// An empty draft is a section somebody opened and never started. Filling
		// it loses nothing; the token rotates so an editor mid-load finds out.
		db.transaction((tx) => {
			tx.update(definitionDraft)
				.set({
					body: found.quote,
					editToken: newEditToken(),
					updatedBy: ctx.user.id,
					updatedAt: new Date(now)
				})
				.where(eq(definitionDraft.definitionId, existing.id))
				.run();
			recordSource(tx as unknown as Db, existing.id);
		});
		return { kind: 'draft', definitionId: existing.id };
	}

	// Adopted, or a draft somebody is writing: the passage becomes a proposal in
	// a discussion, where changing what a community said belongs.
	const thread = openDiscussion(
		ctx,
		{
			title: `From our own documents: ${standard.view.localise(standard.view.section(sectionKey)!.i18n, 'en').value.title}`,
			about: { kind: 'definition', definitionId: existing.id }
		},
		{ db }
	);
	addProposal(ctx, { discussionId: thread.id, body: found.quote }, { db });
	return { kind: 'proposal', discussionId: thread.id };
}

/**
 * The staling pass `deleteDocument` runs before the passages go.
 *
 * Confirmed and suggested claims about a destroyed document become `stale` —
 * readable, attributed, re-confirmable against a future upload. Dismissed stays
 * dismissed; it is already settled.
 */
export function staleEvidenceForDocument(db: Db, documentId: string): void {
	const owned = db
		.select({ id: passage.id })
		.from(passage)
		.where(eq(passage.documentId, documentId))
		.all()
		.map((row) => row.id);
	if (owned.length === 0) return;

	db.update(evidence)
		.set({ state: 'stale' })
		.where(and(inArray(evidence.passageId, owned), ne(evidence.state, 'dismissed')))
		.run();
}

registerTenantService({ name: 'evidence.get', subject: 'evidence', call: getEvidence });
registerTenantService({
	name: 'evidence.definitionOrigin',
	subject: 'definition',
	call: definitionOrigin
});
registerTenantService({ name: 'evidence.confirm', subject: 'evidence', call: confirmEvidence });
registerTenantService({ name: 'evidence.dismiss', subject: 'evidence', call: dismissEvidence });
registerTenantService({
	name: 'evidence.turnIntoDefinition',
	subject: 'evidence',
	call: turnIntoDefinition
});
registerTenantService({
	name: 'evidence.map',
	subject: 'passage',
	call: (ctx, subjectId) => mapPassage(ctx, { passageId: subjectId, clause: '2.1.1' })
});
registerTenantService({
	name: 'evidence.changeClause',
	subject: 'evidence',
	call: (ctx, subjectId) => changeClause(ctx, subjectId, '2.1.1')
});
registerTenantService({
	name: 'evidence.dismissPassage',
	subject: 'passage',
	call: dismissPassage
});
registerTenantService({
	name: 'evidence.reconfirmCandidates',
	subject: 'document',
	call: reconfirmCandidates
});
registerTenantService({ name: 'evidence.reconfirm', subject: 'evidence', call: reconfirmStale });
registerTenantService({
	name: 'evidence.forDocument',
	subject: 'document',
	call: evidenceForDocument
});

export type DefinitionOrigin = {
	documentId: string;
	filename: string;
	/** Where the words still are, when they still are. */
	passageId: string | null;
	page: number | null;
	/** What the community's document said, kept on the claim whatever became of the passage. */
	quote: string;
};

/**
 * The document a definition's text began as, if it began as one.
 *
 * Shown on the definition screen so a reader can get from the wording back to
 * the community's own 2019 bylaws — the provenance the `definitions` spec asks
 * a version to record. Found through the claim's own `document_id`, not the
 * passage: a replaced file or a re-read removes passages, and a provenance line
 * that vanished with them would be exactly the history this is for. When the
 * passage is gone the quote stands in for the page; only when the document
 * itself is destroyed is there nothing left to name.
 */
export function definitionOrigin(
	ctx: Ctx,
	definitionId: string,
	options: { db?: Db } = {}
): DefinitionOrigin | null {
	const db = options.db ?? getDb();
	// Refuses for a definition that is not this community's, and returns null for
	// one that is but has no origin. Two different questions, and answering both
	// with null would make "not yours" and "typed by hand" indistinguishable.
	getDefinition(ctx, definitionId, { db });

	const found = db
		.select({ source: definitionSource, claim: evidence, document })
		.from(definitionSource)
		.innerJoin(evidence, eq(evidence.id, definitionSource.evidenceId))
		.innerJoin(document, eq(document.id, evidence.documentId))
		.where(
			and(
				eq(definitionSource.definitionId, definitionId),
				eq(document.communityId, ctx.community.id)
			)
		)
		.get();
	if (!found) return null;

	const at = found.source.passageId
		? db.select().from(passage).where(eq(passage.id, found.source.passageId)).get()
		: undefined;

	return {
		documentId: found.document.id,
		filename: found.document.filename,
		passageId: at?.id ?? null,
		page: at?.page ?? null,
		quote: found.claim.quote
	};
}

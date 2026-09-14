import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { communityOf, type Reader } from '../auth/audience.js';
import { requireRead, visibleLevels, visibleTo } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import {
	clauseCoverage,
	definition,
	definitionDraft,
	definitionVersion
} from '../db/schema/definitions.js';
import {
	changeLog,
	decision,
	decisionAttendee,
	decisionClause,
	type Decision
} from '../db/schema/decisions.js';
import { discussion, post } from '../db/schema/discussions.js';
import { isCurrentShape } from '../../shared/linter.js';
import { countUnresolved } from './objections.js';
import { proposalToFreeze } from './discussions.js';
import { activeStandardView, DECISION_MATRIX, isArtifactComplete } from './completeness.js';
import { activeMemberships, notify } from './notifications.js';
import { getSearchIndex } from '../search/index.js';
import { indexDecision, indexDefinition } from './search.js';
import { registerTenantService } from './registry.js';
import { reached } from './funnel.js';

/**
 * The freeze. docs/03-data-model.md §6, §7, UI spec §5.1.
 *
 * One act producing a decision, a definition version, the clause coverage that
 * version answers, and a change-log entry — atomically, because a community that
 * has three of the four has a register that lies.
 *
 * Everything else here follows from one sentence: **a decision that cannot be
 * found, attributed and quoted a year later is worse than no decision recorded
 * at all**, because the community will believe it has one.
 */

export type Attendee = {
	membershipId?: string;
	externalName?: string;
	/** Asked at the freeze because P6 cannot go back and ask the room. */
	consentedToPublish?: boolean;
};

export type FreezeInput = {
	discussionId: string;
	/**
	 * The version to adopt. Absent means the thread's most recent, which is what
	 * the freeze did unconditionally before a version could be chosen.
	 */
	proposalPostId?: string;
	/** Minted when the form rendered. Makes one person's double submit idempotent. */
	idempotencyKey: string;
	title: string;
	type: 'constitutional' | 'strategic' | 'operational';
	mechanism: string;
	threshold?: string | null;
	tallyPresent?: number | null;
	tallyFor?: number | null;
	tallyAgainst?: number | null;
	rationale?: string | null;
	reviewDueAt?: number | null;
	attendees?: Attendee[];
};

/**
 * The year a reference carries, in the community's own timezone.
 *
 * A community in Ecuador filing at 18:00 local on 31 December must not get next
 * year's stamp because the server is in UTC. This is why `community.timezone` is
 * required rather than optional.
 */
export function decisionYear(at: number, timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(new Date(at));
}

export function formatRef(year: string, seq: number): string {
	return `DEC-${year}-${String(seq).padStart(3, '0')}`;
}

export function getDecision(
	reader: Reader,
	decisionId: string,
	options: { db?: Db } = {}
): Decision {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(decision)
		.where(
			and(
				eq(decision.id, decisionId),
				eq(decision.communityId, communityOf(audience)),
				visibleTo(audience, decision.visibility)
			)
		)
		.get();
	if (!found) error(404, 'Not found');
	return found;
}

/** The permalink's lookup: `/c/{slug}/d/DEC-2026-014`. */
export function getDecisionByRef(reader: Reader, ref: string, options: { db?: Db } = {}): Decision {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();

	const found = db
		.select()
		.from(decision)
		.where(
			and(
				eq(decision.ref, ref),
				eq(decision.communityId, communityOf(audience)),
				visibleTo(audience, decision.visibility)
			)
		)
		.get();
	if (!found) error(404, 'Not found');
	return found;
}

export function listDecisions(reader: Reader, options: { db?: Db } = {}): Decision[] {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();
	return db
		.select()
		.from(decision)
		.where(
			and(eq(decision.communityId, communityOf(audience)), visibleTo(audience, decision.visibility))
		)
		.orderBy(desc(decision.seq))
		.all();
}

/**
 * Record a decision, and everything that follows from it.
 *
 * Nothing in here reaches the network, sends mail, or calls a model: the
 * transaction holds a write lock, and a slow SMTP server must never be able to
 * hold it. Notification work is enqueued by the caller afterwards.
 */
export const DECISION_TYPES = ['constitutional', 'strategic', 'operational'] as const;

export function freeze(ctx: Ctx, input: FreezeInput, options: { db?: Db } = {}): Decision {
	requirePermission(ctx, 'decision.freeze');
	requireWritableCommunity(ctx);

	// Checked here because the database will not: drizzle's `text({ enum })` is a
	// TypeScript constraint, and SQLite stores whatever it is handed. A form
	// posting a type nobody defined would otherwise become a decision with a type
	// no screen can render.
	if (!DECISION_TYPES.includes(input.type)) {
		error(400, `A decision is constitutional, strategic or operational.`);
	}
	if (!input.title.trim()) error(400, 'Give the decision a title.');
	if (!input.mechanism.trim()) error(400, 'Record how it was decided.');

	const db = options.db ?? getDb();
	const now = ctx.now();

	// Same key, same person, same form: hand back what already exists rather
	// than burning a second reference number.
	const already = db
		.select()
		.from(decision)
		.where(
			and(
				eq(decision.communityId, ctx.community.id),
				eq(decision.idempotencyKey, input.idempotencyKey)
			)
		)
		.get();
	if (already) return already;

	const thread = db
		.select()
		.from(discussion)
		.where(and(eq(discussion.id, input.discussionId), eq(discussion.communityId, ctx.community.id)))
		.get();
	if (!thread) error(404, 'Not found');

	// Refuses a thread with nothing to record, one already decided, and a
	// proposal already recorded — the guard the idempotency key cannot provide,
	// because two people freezing produce two keys.
	const proposal = proposalToFreeze(ctx, input.discussionId, {
		db,
		proposalPostId: input.proposalPostId
	});

	const standard = activeStandardView(db, ctx);
	if (!standard) error(409, 'This community has not adopted a standard yet.');

	// Until a community has said how it decides, everything it records was
	// decided under a rule it had not agreed. docs/03 §7.
	const provisional = !isArtifactComplete(ctx, DECISION_MATRIX, { db });

	const unresolvedObjections = countUnresolved(db, proposal.id);

	return db.transaction((tx) => {
		const target = resolveDefinition(tx as unknown as Db, ctx, thread, standard, now);

		// Allocated inside the transaction, so a freeze that rolls back consumes
		// no number and the next one takes it. SQLite serialises writers, which is
		// what makes `max + 1` correct here without a counter row; Postgres will
		// need `SELECT … FOR UPDATE` (docs/00 §5).
		const [highest] = tx
			.select({ seq: sql<number>`coalesce(max(${decision.seq}), 0)` })
			.from(decision)
			.where(eq(decision.communityId, ctx.community.id))
			.all();
		const seq = (highest?.seq ?? 0) + 1;

		const decisionId = newId();
		tx.insert(decision)
			.values({
				id: decisionId,
				communityId: ctx.community.id,
				seq,
				ref: formatRef(decisionYear(now, ctx.community.timezone), seq),
				title: input.title.trim(),
				type: input.type,
				layer: target.layer,
				mechanism: input.mechanism.trim(),
				threshold: input.threshold?.trim() || null,
				tallyPresent: input.tallyPresent ?? null,
				tallyFor: input.tallyFor ?? null,
				tallyAgainst: input.tallyAgainst ?? null,
				unresolvedObjections,
				rationale: input.rationale?.trim() || null,
				proposalText: proposal.body,
				decidedAt: new Date(now),
				reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : null,
				source: thread.origin === 'offline' ? 'offline' : 'online',
				provisional,
				status: 'active',
				supersededById: null,
				idempotencyKey: input.idempotencyKey,
				recordedBy: ctx.user.id,
				proposalPostId: proposal.id
			})
			.run();

		for (const attendee of input.attendees ?? []) {
			tx.insert(decisionAttendee)
				.values({
					id: newId(),
					decisionId,
					membershipId: attendee.membershipId ?? null,
					externalName: attendee.externalName ?? null,
					consentedToPublish: attendee.consentedToPublish ?? false
				})
				.run();
		}

		/**
		 * The clauses this answers, **as they were quoted at decision time**.
		 *
		 * Never rewritten by a migration or a standard upgrade: the community
		 * decided about the clause that carried that number in the version they had
		 * adopted. The stable key rides alongside so the application can still
		 * follow the same obligation across versions.
		 */
		for (const clause of target.clauses) {
			tx.insert(decisionClause)
				.values({
					decisionId,
					standardId: standard.row.standardId,
					version: standard.row.version,
					ref: clause.ref,
					clauseKey: clause.key
				})
				.run();
		}

		// Supersede rather than rewrite. The old decision keeps its reference, its
		// text and its tally, and its permalink keeps resolving — it says what was
		// true then, and points at what replaced it.
		const previous = target.definitionRow.adoptedVersionId
			? tx
					.select()
					.from(definitionVersion)
					.where(eq(definitionVersion.id, target.definitionRow.adoptedVersionId))
					.get()
			: undefined;
		if (previous?.decisionId) {
			tx.update(decision)
				.set({ status: 'superseded', supersededById: decisionId })
				.where(eq(decision.id, previous.decisionId))
				.run();
		}

		const [lastVersion] = tx
			.select({ n: sql<number>`coalesce(max(${definitionVersion.n}), 0)` })
			.from(definitionVersion)
			.where(eq(definitionVersion.definitionId, target.definitionRow.id))
			.all();

		const draft = tx
			.select()
			.from(definitionDraft)
			.where(eq(definitionDraft.definitionId, target.definitionRow.id))
			.get();

		const adoptedLint = isCurrentShape(proposal.linterResult) ? proposal.linterResult : null;

		const versionId = newId();
		tx.insert(definitionVersion)
			.values({
				id: versionId,
				definitionId: target.definitionRow.id,
				n: (lastVersion?.n ?? 0) + 1,
				// The proposal exactly as adopted: the register quotes itself.
				body: proposal.body,
				plainLanguage: draft?.plainLanguage ?? null,
				/**
				 * What the linter said about the text being adopted, and the job it
				 * derived — carried from the proposal rather than written as null.
				 *
				 * The `definitions` spec has always required a version to record its
				 * linter result, and this line wrote null, so no version has ever
				 * recorded one: a reader a year later could see that a community
				 * froze over a warning only by re-running the linter against rules
				 * that may since have changed.
				 *
				 * `aiAssisted` stays false, and that is still not the truth — nothing
				 * anywhere records that a draft was written with help, so there is no
				 * flag to carry. Inventing one here would be worse than the gap:
				 * `false` is at least not a claim about a call nobody logged. Closing
				 * it means recording assistance where it happens, which is the AI
				 * surface's work and not this change's.
				 */
				type: adoptedLint?.primaryJob ?? null,
				authorId: proposal.authorId,
				aiAssisted: false,
				aiTask: null,
				linterResult: proposal.linterResult ?? null,
				createdAt: new Date(now),
				adoptedAt: new Date(now),
				decisionId,
				supersedesVersionId: previous?.id ?? null
			})
			.run();

		tx.update(definition)
			.set({
				adoptedVersionId: versionId,
				openProposalId: null,
				provisional,
				reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : null,
				updatedAt: new Date(now)
			})
			.where(eq(definition.id, target.definitionRow.id))
			.run();

		/**
		 * Two of the seven onboarding milestones, inside the transaction that makes
		 * them true. `docs/00` §12.
		 *
		 * Counted from the adopted definitions rather than kept as a running total:
		 * a counter would have to be right after every supersession, and this is a
		 * question asked once a month by one operator.
		 */
		const adopted = tx
			.select({ id: definition.id })
			.from(definition)
			.where(
				and(eq(definition.communityId, ctx.community.id), isNotNull(definition.adoptedVersionId))
			)
			.all().length;
		reached(tx as unknown as Db, ctx.community.id, 'definition.first', now);
		if (adopted >= 5) reached(tx as unknown as Db, ctx.community.id, 'definition.fifth', now);

		// Coverage is the clause → definition edge readiness counts. Rebuilt on
		// adopt, and unique per clause, so an auditor asking "where did you define
		// this?" gets exactly one answer.
		for (const clause of target.clauses) {
			tx.insert(clauseCoverage)
				.values({
					communityId: ctx.community.id,
					communityStandardId: standard.row.id,
					clauseKey: clause.key,
					definitionId: target.definitionRow.id
				})
				.onConflictDoUpdate({
					target: [clauseCoverage.communityStandardId, clauseCoverage.clauseKey],
					set: { definitionId: target.definitionRow.id }
				})
				.run();
		}

		// A proposal freezes once. Set here, inside the transaction, because two
		// people pressing Freeze mint two idempotency keys and the key cannot see
		// them as the same act.
		tx.update(post).set({ frozenDecisionId: decisionId }).where(eq(post.id, proposal.id)).run();

		/**
		 * The thread records what it has decided, and stays open.
		 *
		 * `frozenDecisionId` is the most recent decision this thread produced, not
		 * its last word: the same argument can produce v5 and a second decision
		 * months later, and that decision supersedes this one through
		 * `definition.adoptedVersionId` above.
		 */
		tx.update(discussion)
			.set({ status: 'frozen', frozenDecisionId: decisionId, lastActivityAt: new Date(now) })
			.where(eq(discussion.id, thread.id))
			.run();

		tx.insert(changeLog)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				at: new Date(now),
				actorId: ctx.user.id,
				kind: 'decision.frozen',
				subjectType: 'decision',
				subjectId: decisionId,
				summary: input.title.trim(),
				payload: {
					ref: formatRef(decisionYear(now, ctx.community.timezone), seq),
					provisional,
					unresolvedObjections,
					source: thread.origin === 'offline' ? 'offline' : 'online'
				}
			})
			.run();

		// Written inside the transaction, not enqueued after it: a decision that
		// exists and told nobody is one half the community finds out about by
		// accident. These are local rows and cost nothing; mail is the weekly
		// digest, which is a job precisely so it never holds this write lock.
		// Findable in the same transaction that made it exist, for the same reason
		// the notification is written here rather than enqueued: a decision that is
		// unfindable for thirty seconds is one a member concludes did not save.
		// The definition is re-indexed too — it now says something different, and
		// the version it stopped saying must stop being findable by its old text.
		indexDecision(tx as unknown as Db, ctx.community.id, decisionId);
		indexDefinition(tx as unknown as Db, ctx.community.id, target.definitionRow.id);

		notify(tx as unknown as Db, ctx, {
			kind: 'decision.frozen',
			subjectType: 'decision',
			subjectId: decisionId,
			summary: input.title.trim(),
			params: {
				title: input.title.trim(),
				ref: formatRef(decisionYear(now, ctx.community.timezone), seq)
			},
			recipients: activeMemberships(tx as unknown as Db, ctx.community.id)
		});

		return tx.select().from(decision).where(eq(decision.id, decisionId)).get()!;
	});
}

type FreezeTarget = {
	definitionRow: typeof definition.$inferSelect;
	layer: number | null;
	clauses: { key: string; ref: string }[];
};

/**
 * What this freeze adopts.
 *
 * A thread opened on a definition adopts that definition. A thread opened on a
 * *clause* adopts the definition of the section that owns it — creating it if
 * this is the first time anyone answered that section, which is the whole "see
 * the gap → decide it" loop.
 */
function resolveDefinition(
	tx: Db,
	ctx: Ctx,
	thread: typeof discussion.$inferSelect,
	standard: NonNullable<ReturnType<typeof activeStandardView>>,
	now: number
): FreezeTarget {
	if (thread.definitionId) {
		const found = tx.select().from(definition).where(eq(definition.id, thread.definitionId)).get();
		if (!found) error(404, 'Not found');

		return {
			definitionRow: found,
			layer: found.layer,
			clauses: found.sectionKey ? clausesOwnedBy(standard.view, found.sectionKey) : []
		};
	}

	if (!thread.clauseKey) error(409, 'This discussion is not about anything that can be decided.');

	const clause =
		standard.view.clause(thread.clauseKey) ?? standard.view.clauseByRef(thread.clauseKey);
	if (!clause) error(409, 'That clause is not part of the standard this community adopted.');
	if (!clause.owner) {
		error(409, 'That clause is not answered by a section, so there is nothing to define.');
	}

	const existing = tx
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityStandardId, standard.row.id),
				eq(definition.sectionKey, clause.owner)
			)
		)
		.get();

	if (existing) {
		return {
			definitionRow: existing,
			layer: existing.layer ?? clause.layer,
			clauses: clausesOwnedBy(standard.view, clause.owner)
		};
	}

	const id = newId();
	tx.insert(definition)
		.values({
			id,
			communityId: ctx.community.id,
			scope: 'standard',
			communityStandardId: standard.row.id,
			sectionKey: clause.owner,
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
			body: '',
			plainLanguage: null,
			type: null,
			editToken: newId(),
			updatedBy: ctx.user.id,
			updatedAt: new Date(now)
		})
		.run();

	return {
		definitionRow: tx.select().from(definition).where(eq(definition.id, id)).get()!,
		layer: clause.layer,
		clauses: clausesOwnedBy(standard.view, clause.owner)
	};
}

/** Every countable clause a section answers. */
function clausesOwnedBy(
	view: NonNullable<ReturnType<typeof activeStandardView>>['view'],
	sectionKey: string
): { key: string; ref: string }[] {
	return view
		.countableClauses()
		.filter((clause) => clause.owner === sectionKey)
		.map((clause) => ({ key: clause.key, ref: clause.ref }));
}

/**
 * The decision that adopted an artifact — what a Ratification Record is rendered
 * from. docs/12, resolved 3 September 2026.
 *
 * It is the decision behind the *last* authored section to be answered: that is
 * the moment the artifact became complete. Returns null while it is not.
 */
export function ratificationRecord(
	ctx: Ctx,
	artifactKey: string,
	options: { db?: Db } = {}
): Decision | null {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	const standard = activeStandardView(db, ctx);
	if (!standard) return null;

	const authored = standard.view.authoredSectionsOf(artifactKey).map((s) => s.key);
	if (authored.length === 0) return null;

	// Restricted to *this artifact's* sections. Read across the whole community
	// standard, the latest adoption is whichever section anyone answered most
	// recently — so a finished Governance Charter would cite the Treasury
	// decision that happened to come after it.
	const adopted = db
		.select({
			sectionKey: definition.sectionKey,
			decisionId: definitionVersion.decisionId,
			adoptedAt: definitionVersion.adoptedAt
		})
		.from(definition)
		.innerJoin(definitionVersion, eq(definitionVersion.id, definition.adoptedVersionId))
		.where(
			and(
				eq(definition.communityStandardId, standard.row.id),
				isNotNull(definition.adoptedVersionId),
				inArray(definition.sectionKey, authored)
			)
		)
		.all();

	// Incomplete artifacts have no ratification record, because they were never
	// ratified.
	const answered = new Set(adopted.map((row) => row.sectionKey));
	if (!authored.every((key) => answered.has(key))) return null;

	const latest = adopted
		.filter((row) => row.decisionId !== null && row.adoptedAt !== null)
		.sort((a, b) => b.adoptedAt!.getTime() - a.adoptedAt!.getTime())[0];
	if (!latest?.decisionId) return null;

	return db.select().from(decision).where(eq(decision.id, latest.decisionId)).get() ?? null;
}

/**
 * Everything still awaiting ratification.
 *
 * Once a community adopts its Decision Matrix, the decisions it took before that
 * were taken under a rule it had not yet agreed. This lists them; ratifying one
 * is a new decision that references it, and never a rewrite of history.
 */
export function awaitingRatification(ctx: Ctx, options: { db?: Db } = {}): Decision[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();

	if (!isArtifactComplete(ctx, DECISION_MATRIX, { db })) return [];

	return db
		.select()
		.from(decision)
		.where(and(eq(decision.communityId, ctx.community.id), eq(decision.provisional, true)))
		.orderBy(decision.seq)
		.all();
}

export type DecisionDetail = {
	decision: Decision;
	clauses: { standardId: string; version: string; ref: string; clauseKey: string }[];
	attendees: { name: string | null; consentedToPublish: boolean }[];
	supersededBy: string | null;
	supersedes: string | null;
};

/** One decision, with everything a reader a year later needs around it. */
export function decisionDetail(ctx: Ctx, ref: string, options: { db?: Db } = {}): DecisionDetail {
	const db = options.db ?? getDb();
	const found = getDecisionByRef(ctx, ref, options);

	const replacement = found.supersededById
		? (db.select().from(decision).where(eq(decision.id, found.supersededById)).get() ?? null)
		: null;
	const replaced =
		db
			.select()
			.from(decision)
			.where(and(eq(decision.communityId, ctx.community.id), eq(decision.supersededById, found.id)))
			.get() ?? null;

	return {
		decision: found,
		clauses: db.select().from(decisionClause).where(eq(decisionClause.decisionId, found.id)).all(),
		// Only the people who agreed to be named are named; the rest are a count.
		attendees: db
			.select()
			.from(decisionAttendee)
			.where(eq(decisionAttendee.decisionId, found.id))
			.all()
			.map((row) => ({
				name: row.consentedToPublish ? row.externalName : null,
				consentedToPublish: row.consentedToPublish
			})),
		supersededBy: replacement?.ref ?? null,
		supersedes: replaced?.ref ?? null
	};
}

/**
 * Reverse lookup: find a decision by what it says, not by its number.
 *
 * A member a year later remembers the question — "can we spend €800 on the water
 * pump?" — and not `DEC-2026-014`. So the search reads the adopted text and the
 * title, which is where the answer actually lives.
 *
 * Delegated to the search seam rather than scanning the table. The substring
 * scan this replaces had the failure that makes substring search feel broken:
 * "spending" did not match "spend", and a member who typed the question the way
 * they would say it got nothing. Ranking comes back with the hits, so the
 * register lists the closest answer first rather than the most recent.
 */
export function searchDecisions(
	reader: Reader,
	query: string,
	options: { db?: Db } = {}
): Decision[] {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();
	if (!query.trim()) return listDecisions(reader, options);

	const hits = getSearchIndex(db).query(communityOf(audience), query, {
		kinds: ['decision'],
		levels: visibleLevels(audience)
	});
	if (hits.length === 0) return [];

	const rows = db
		.select()
		.from(decision)
		.where(
			and(
				eq(decision.communityId, communityOf(audience)),
				visibleTo(audience, decision.visibility),
				inArray(
					decision.id,
					hits.map((hit) => hit.subjectId)
				)
			)
		)
		.all();

	// Back into the engine's order: `in (…)` returns rows in whatever order the
	// query planner likes, and the ranking is the reason to have asked.
	const byId = new Map(rows.map((row) => [row.id, row]));
	return hits.map((hit) => byId.get(hit.subjectId)).filter((row): row is Decision => Boolean(row));
}

registerTenantService({ name: 'decisions.get', subject: 'decision', call: getDecision });
registerTenantService({ name: 'decisions.byRef', subject: 'decisionRef', call: getDecisionByRef });
registerTenantService({ name: 'decisions.detail', subject: 'decisionRef', call: decisionDetail });

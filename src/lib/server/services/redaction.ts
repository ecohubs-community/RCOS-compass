import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { changeLog, decision, decisionAttendee } from '../db/schema/decisions.js';
import { definition, definitionVersion } from '../db/schema/definitions.js';
import { discussion, objection, post } from '../db/schema/discussions.js';
import { community } from '../db/schema/tenancy.js';
import { enqueue } from '../jobs/queue.js';
import { systemClock } from '../clock.js';
import { membershipLabel } from './person.js';
import { indexDecision, indexDefinition } from './search.js';

/**
 * Taking a person's name out of something a member wrote.
 * `docs/03-data-model.md` §10.
 *
 * The correction flow — supersede with a new version, keep the old one — is the
 * right answer when text is *wrong*, and it is not an answer to an erasure
 * request: a name inside a superseded version is still a name we hold. So there
 * are two operations and they are not the same thing.
 *
 * **A redaction replaces a span in place and says that it did.** What it must
 * never do is make the record less true. It reaches free text only — what
 * somebody typed — and never the structure a decision is: not the reference, not
 * the date, not the mechanism, not the tally, and not the existence of an
 * attendance row. After a redaction the register still says eleven people were
 * present and how they decided; it just no longer says one of their names.
 *
 * **The change-log entry never quotes what went.** An audit trail that records
 * the removed text is the leak with extra steps, and it is the kind of mistake
 * that looks like diligence.
 */

export const REDACTION_MARKER = '[redacted at the request of the person named]';

/** What a redaction can reach: free text, and one name typed into a record. */
export type RedactionTarget =
	| { type: 'definition_version'; id: string }
	| { type: 'decision_rationale'; id: string }
	| { type: 'decision_proposal'; id: string }
	| { type: 'post'; id: string }
	| { type: 'objection'; id: string }
	| { type: 'external_attendee'; id: string };

export type RedactionInput = {
	target: RedactionTarget;
	/** The exact text to remove. Never stored anywhere afterwards. */
	span: string;
	/** Why, in the community's own words. Never the span. */
	reason: string;
};

export function redact(ctx: Ctx, input: RedactionInput, options: { db?: Db } = {}): void {
	// Steward-only, like restriction: removing text from a record a community
	// keeps is a governance act, and the community sees who did it.
	requirePermission(ctx, 'exception.create');
	requireWritableCommunity(ctx);

	const span = input.span.trim();
	if (!span) error(400, 'Say which words are to be removed.');
	const reason = input.reason.trim();
	if (!reason) error(400, 'Say why this has to be redacted.');

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	db.transaction((tx) => {
		const scoped = tx as unknown as Db;
		const found = load(scoped, ctx.community.id, input.target);
		if (!found) error(404, 'Not found');
		if (!found.text.includes(span)) {
			// A redaction that matched nothing would be recorded as though something
			// had happened, which is worse than a refusal: the log would say a name
			// was removed from a record that still contains it.
			error(409, 'Those words are not in this text.');
		}

		const replaced = found.text.split(span).join(REDACTION_MARKER);
		found.write(scoped, replaced);

		/**
		 * The index holds its own copy of the body. Reindexing in the same
		 * transaction is what stops the removed name being findable through the
		 * search box after it has gone from the page — the same rule a visibility
		 * change follows, for the same reason.
		 */
		if (found.reindex) found.reindex(scoped);

		tx.insert(changeLog)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				at: now,
				actorId: ctx.user.id,
				kind: 'record.redacted',
				subjectType: input.target.type,
				subjectId: input.target.id,
				// The reason, never the span. A change log that quotes what was
				// removed has not removed it.
				summary: reason,
				payload: null
			})
			.run();
	});

	/**
	 * And the mirror, so its *current* state carries the marker.
	 *
	 * After the transaction, never inside it: a failing git push must not roll
	 * back a redaction any more than it may roll back a decision. History is not
	 * rewritten — that is a community's own repository and not ours to rewrite —
	 * which is exactly why the policy says a clone taken beforehand is beyond
	 * reach.
	 */
	const mirrored = db
		.select({ enabled: community.gitMirrorEnabled })
		.from(community)
		.where(eq(community.id, ctx.community.id))
		.get();
	if (mirrored?.enabled) {
		enqueue(db, systemClock, {
			kind: 'mirror-commit',
			payload: {
				communityId: ctx.community.id,
				actorLabel: membershipLabel(ctx.membership.seq),
				subject: 'Redaction'
			}
		});
	}
}

type Loaded = {
	text: string;
	write: (db: Db, replaced: string) => void;
	/** Where the searchable copy lives, when there is one. */
	reindex?: (db: Db) => void;
};

/**
 * One target, checked to belong to this community.
 *
 * Every branch joins back to `community_id` rather than trusting the id it was
 * given: a redaction is a write, and a write addressed by id alone is a
 * cross-tenant edit waiting for somebody to guess a uuid.
 */
function load(db: Db, communityId: string, target: RedactionTarget): Loaded | null {
	switch (target.type) {
		case 'definition_version': {
			const row = db
				.select({
					id: definitionVersion.id,
					body: definitionVersion.body,
					definitionId: definition.id
				})
				.from(definitionVersion)
				.innerJoin(definition, eq(definition.id, definitionVersion.definitionId))
				.where(and(eq(definitionVersion.id, target.id), eq(definition.communityId, communityId)))
				.get();
			if (!row) return null;
			return {
				text: row.body,
				write: (scoped, replaced) =>
					scoped
						.update(definitionVersion)
						.set({ body: replaced })
						.where(eq(definitionVersion.id, row.id))
						.run(),
				reindex: (scoped) => indexDefinition(scoped, communityId, row.definitionId)
			};
		}

		case 'decision_rationale':
		case 'decision_proposal': {
			const row = db
				.select()
				.from(decision)
				.where(and(eq(decision.id, target.id), eq(decision.communityId, communityId)))
				.get();
			if (!row) return null;
			const rationale = target.type === 'decision_rationale';
			return {
				text: (rationale ? row.rationale : row.proposalText) ?? '',
				write: (scoped, replaced) =>
					scoped
						.update(decision)
						.set(rationale ? { rationale: replaced } : { proposalText: replaced })
						.where(eq(decision.id, row.id))
						.run(),
				reindex: (scoped) => indexDecision(scoped, communityId, row.id)
			};
		}

		case 'post': {
			const row = db
				.select({ id: post.id, body: post.body })
				.from(post)
				.innerJoin(discussion, eq(discussion.id, post.discussionId))
				.where(and(eq(post.id, target.id), eq(discussion.communityId, communityId)))
				.get();
			if (!row) return null;
			return {
				text: row.body,
				write: (scoped, replaced) =>
					scoped.update(post).set({ body: replaced }).where(eq(post.id, row.id)).run()
			};
		}

		case 'objection': {
			const row = db
				.select({ id: objection.id, reason: objection.reason })
				.from(objection)
				.innerJoin(post, eq(post.id, objection.proposalPostId))
				.innerJoin(discussion, eq(discussion.id, post.discussionId))
				.where(and(eq(objection.id, target.id), eq(discussion.communityId, communityId)))
				.get();
			if (!row) return null;
			return {
				text: row.reason,
				write: (scoped, replaced) =>
					scoped.update(objection).set({ reason: replaced }).where(eq(objection.id, row.id)).run()
			};
		}

		case 'external_attendee': {
			/**
			 * Somebody present who was never a member — a facilitator, a neighbour.
			 * They hold no account and have no way to ask the product for anything,
			 * which makes this the most exposed personal data it stores and the
			 * reason this target exists at all.
			 *
			 * The row itself stays: it is what makes the tally true.
			 */
			const row = db
				.select({ id: decisionAttendee.id, name: decisionAttendee.externalName })
				.from(decisionAttendee)
				.innerJoin(decision, eq(decision.id, decisionAttendee.decisionId))
				.where(and(eq(decisionAttendee.id, target.id), eq(decision.communityId, communityId)))
				.get();
			if (!row?.name) return null;
			return {
				text: row.name,
				write: (scoped, replaced) =>
					scoped
						.update(decisionAttendee)
						.set({ externalName: replaced })
						.where(eq(decisionAttendee.id, row.id))
						.run()
			};
		}
	}
}

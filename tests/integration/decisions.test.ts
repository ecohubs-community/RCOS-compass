import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	clauseCoverage,
	definition,
	definitionVersion
} from '../../src/lib/server/db/schema/definitions.js';
import {
	changeLog,
	decision,
	decisionAttendee,
	decisionClause
} from '../../src/lib/server/db/schema/decisions.js';
import { discussion, post } from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import {
	addProposal,
	openDiscussion,
	takeOffline
} from '../../src/lib/server/services/discussions.js';
import {
	awaitingRatification,
	decisionYear,
	freeze,
	getDecisionByRef,
	listDecisions,
	ratificationRecord
} from '../../src/lib/server/services/decisions.js';
import { raiseObjection } from '../../src/lib/server/services/objections.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The freeze. docs/03-data-model.md §6, §7.
 *
 * Most of this suite exists because of a review pass that found the freeze's
 * hardest cases stated and unbuilt: gaplessness across a rollback, the year
 * stamp at a timezone boundary, the second duplicate an idempotency key cannot
 * see, and a clause reference that must keep saying what it said.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');

/** A clause the standard says a section answers, so a freeze has something real. */
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let memberCtx: Ctx;

function seedCommunity(slug: string, timezone = 'America/Guayaquil') {
	const community = makeCommunity(db, { slug, timezone });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: community.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();

	const person = makeUser(db, { email: `steward-${slug}@example.org` });
	const seat = makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true });
	return { community, ctx: { user: person, community, membership: seat, now: () => NOW } as Ctx };
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ctx = seedCommunity('valle-verde').ctx;

	const person = makeUser(db, { email: 'lena@example.org' });
	const seat = makeMembership(db, ctx.community.id, person.id, { role: 'member' });
	memberCtx = { ...ctx, user: person, membership: seat };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

/** A thread on a real clause, with a proposal ready to freeze. */
function threadWithProposal(who: Ctx = ctx, body = 'Members may leave at any time.') {
	const opened = openDiscussion(
		who,
		{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: COUNTABLE.key } },
		{ db }
	);
	addProposal(who, { discussionId: opened.id, body }, { db });
	return opened;
}

let keyCounter = 0;
const freezeIt = (who: Ctx, discussionId: string, overrides: Record<string, unknown> = {}) =>
	freeze(
		who,
		{
			discussionId,
			idempotencyKey: `key-${(keyCounter += 1)}`,
			title: 'Exit and separation',
			type: 'strategic',
			mechanism: 'consent',
			tallyPresent: 9,
			tallyFor: 9,
			tallyAgainst: 0,
			...overrides
		} as Parameters<typeof freeze>[1],
		{ db }
	);

describe('a freeze produces everything or nothing', () => {
	it('creates the decision, the version, the coverage and the change-log entry', () => {
		const thread = threadWithProposal();
		const recorded = freezeIt(ctx, thread.id);

		expect(recorded.ref).toMatch(/^DEC-2026-001$/);
		expect(recorded.proposalText).toBe('Members may leave at any time.');

		const version = db.select().from(definitionVersion).all();
		expect(version).toHaveLength(1);
		expect(version[0]!.adoptedAt?.getTime()).toBe(NOW);
		expect(version[0]!.decisionId).toBe(recorded.id);

		const answered = db.select().from(definition).all()[0]!;
		expect(answered.adoptedVersionId).toBe(version[0]!.id);
		expect(answered.sectionKey).toBe(COUNTABLE.owner);

		expect(db.select().from(clauseCoverage).all().length).toBeGreaterThan(0);

		const [logged] = db.select().from(changeLog).all();
		expect(logged!.kind).toBe('decision.frozen');
		expect(logged!.subjectId).toBe(recorded.id);
	});

	it('leaves nothing behind when it fails part-way', () => {
		const thread = threadWithProposal();

		// An attendee naming a membership that is not there. The foreign key
		// refuses it *after* the decision row has been written, which is exactly
		// the "part-way" this needs to be about.
		expect(() =>
			freezeIt(ctx, thread.id, { attendees: [{ membershipId: 'no-such-membership' }] })
		).toThrow();

		expect(db.select().from(decision).all()).toHaveLength(0);
		expect(db.select().from(definitionVersion).all()).toHaveLength(0);
		expect(db.select().from(changeLog).all()).toHaveLength(0);
		expect(db.select().from(clauseCoverage).all()).toHaveLength(0);
	});

	it('refuses a type no screen could render, before writing anything', () => {
		const thread = threadWithProposal();
		const refusal = catchRefusal(() =>
			freezeIt(ctx, thread.id, { type: 'not-a-type' as 'strategic' })
		);

		expect(refusal?.status).toBe(400);
		expect(db.select().from(decision).all()).toHaveLength(0);
	});
});

describe('decision references are gapless and permanent', () => {
	it('numbers three in a row with no gaps', () => {
		for (let i = 0; i < 3; i += 1) {
			freezeIt(ctx, threadWithProposal().id);
		}
		expect(
			listDecisions(ctx, { db })
				.map((d) => d.seq)
				.sort()
		).toEqual([1, 2, 3]);
		expect(
			listDecisions(ctx, { db })
				.map((d) => d.ref)
				.sort()
		).toEqual(['DEC-2026-001', 'DEC-2026-002', 'DEC-2026-003']);
	});

	it('gives the next freeze the number a failed one did not consume', () => {
		freezeIt(ctx, threadWithProposal().id);

		const doomed = threadWithProposal();
		expect(() =>
			freezeIt(ctx, doomed.id, { attendees: [{ membershipId: 'no-such-membership' }] })
		).toThrow();

		const next = freezeIt(ctx, threadWithProposal().id);
		expect(next.seq).toBe(2);
		expect(next.ref).toBe('DEC-2026-002');
	});

	it('stamps the year in the community-s own timezone, not the server-s', () => {
		// 31 December 23:30 UTC is already 1 January in Auckland and still 31
		// December in Quito. A community filing at 18:00 local must not get next
		// year's stamp.
		const newYearEveUtc = Date.UTC(2026, 11, 31, 23, 30, 0);
		expect(decisionYear(newYearEveUtc, 'Pacific/Auckland')).toBe('2027');
		expect(decisionYear(newYearEveUtc, 'America/Guayaquil')).toBe('2026');
		expect(decisionYear(newYearEveUtc, 'UTC')).toBe('2026');
	});

	it('uses that timezone when it writes the reference', () => {
		const ecuador = seedCommunity('quito', 'America/Guayaquil');
		const lateOnNewYearsEve = Date.UTC(2026, 11, 31, 23, 30, 0);
		const at = { ...ecuador.ctx, now: () => lateOnNewYearsEve };

		const thread = threadWithProposal(at);
		expect(freezeIt(at, thread.id).ref).toBe('DEC-2026-001');
	});

	it('counts per community, so each gets its own first', () => {
		freezeIt(ctx, threadWithProposal().id);
		const other = seedCommunity('other-place');

		expect(freezeIt(other.ctx, threadWithProposal(other.ctx).id).seq).toBe(1);
	});
});

describe('two different duplicates, and one key stops only the first', () => {
	it('returns the same decision for the same key', () => {
		const thread = threadWithProposal();
		const first = freeze(
			ctx,
			{
				discussionId: thread.id,
				idempotencyKey: 'same-form',
				title: 'Exit',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);
		const second = freeze(
			ctx,
			{
				discussionId: thread.id,
				idempotencyKey: 'same-form',
				title: 'Exit',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);

		expect(second.id).toBe(first.id);
		expect(db.select().from(decision).all()).toHaveLength(1);
	});

	it('refuses a second freeze of the same proposal from a different form', () => {
		// Two stewards each opened the modal, so there are two keys. The key cannot
		// see them as one act; `post.frozenDecisionId` can.
		const thread = threadWithProposal();
		freezeIt(ctx, thread.id);

		const refusal = catchRefusal(() => freezeIt(ctx, thread.id));
		expect(refusal?.status).toBe(409);
		expect(db.select().from(decision).all()).toHaveLength(1);
	});

	it('marks the proposal spent, and records the decision on the thread', () => {
		const thread = threadWithProposal();
		const recorded = freezeIt(ctx, thread.id);

		const proposal = db
			.select()
			.from(post)
			.all()
			.find((p) => p.kind === 'proposal')!;
		expect(proposal.frozenDecisionId).toBe(recorded.id);

		const row = db.select().from(discussion).where(eq(discussion.id, thread.id)).get()!;
		expect(row.status).toBe('frozen');
		expect(row.frozenDecisionId).toBe(recorded.id);
	});
});

describe('a thread can decide more than once over its life', () => {
	it('freezes a later version and supersedes the decision before it', () => {
		const thread = threadWithProposal();
		const first = freezeIt(ctx, thread.id);

		// Months later, the same argument comes back and produces a new version.
		const v2 = addProposal(ctx, { discussionId: thread.id, body: 'A settled version.' }, { db });
		const second = freezeIt(ctx, thread.id);

		expect(second.id).not.toBe(first.id);
		expect(second.ref).not.toBe(first.ref);

		const earlier = db.select().from(decision).where(eq(decision.id, first.id)).get()!;
		expect(earlier.status).toBe('superseded');
		expect(earlier.supersededById).toBe(second.id);
		// Its own record is untouched — it says what was true then.
		expect(earlier.ref).toBe(first.ref);
		expect(earlier.proposalText).toBe('Members may leave at any time.');
		expect(earlier.tallyPresent).toBe(9);

		expect(db.select().from(post).where(eq(post.id, v2.id)).get()!.frozenDecisionId).toBe(
			second.id
		);
		// The thread now names the decision in force.
		expect(
			db.select().from(discussion).where(eq(discussion.id, thread.id)).get()!.frozenDecisionId
		).toBe(second.id);
	});

	it("adopts the version the steward chose, not the thread's latest", () => {
		// v1 was agreed; v2 drew objections. The community records v1.
		const thread = threadWithProposal();
		const v1 = db
			.select()
			.from(post)
			.all()
			.find((p) => p.kind === 'proposal')!;
		addProposal(ctx, { discussionId: thread.id, body: 'A version nobody liked.' }, { db });

		const recorded = freezeIt(ctx, thread.id, { proposalPostId: v1.id });

		expect(recorded.proposalText).toBe('Members may leave at any time.');
		expect(db.select().from(post).where(eq(post.id, v1.id)).get()!.frozenDecisionId).toBe(
			recorded.id
		);
	});

	it('leaves a newer version freezable after an earlier one is recorded', () => {
		const thread = threadWithProposal();
		const v1 = db
			.select()
			.from(post)
			.all()
			.find((p) => p.kind === 'proposal')!;
		const v2 = addProposal(ctx, { discussionId: thread.id, body: 'The later text.' }, { db });

		freezeIt(ctx, thread.id, { proposalPostId: v1.id });
		const second = freezeIt(ctx, thread.id, { proposalPostId: v2.id });

		expect(second.proposalText).toBe('The later text.');
		expect(db.select().from(decision).all()).toHaveLength(2);
	});

	it('refuses a version from a different discussion, and consumes no reference', () => {
		const thread = threadWithProposal();
		const other = threadWithProposal(ctx, "Someone else's rule.");
		const foreign = db
			.select()
			.from(post)
			.where(eq(post.discussionId, other.id))
			.all()
			.find((p) => p.kind === 'proposal')!;

		const before = db.select().from(decision).all().length;
		const refusal = catchRefusal(() => freezeIt(ctx, thread.id, { proposalPostId: foreign.id }));

		expect(refusal?.status).toBe(404);
		expect(db.select().from(decision).all()).toHaveLength(before);
	});
});

describe('a decision quotes a clause reference and keeps quoting it', () => {
	it('stores the standard, the version, the reference and the stable key', () => {
		const thread = threadWithProposal();
		const recorded = freezeIt(ctx, thread.id);

		const quoted = db
			.select()
			.from(decisionClause)
			.where(eq(decisionClause.decisionId, recorded.id))
			.all();

		expect(quoted.length).toBeGreaterThan(0);
		expect(quoted[0]).toMatchObject({ standardId: 'rcos-core', version: '0.1' });
		expect(quoted.map((q) => q.ref)).toContain(COUNTABLE.ref);
		expect(quoted.map((q) => q.clauseKey)).toContain(COUNTABLE.key);
	});

	it('keeps the reference even if the standard would renumber it', () => {
		const thread = threadWithProposal();
		const recorded = freezeIt(ctx, thread.id);
		const before = db
			.select()
			.from(decisionClause)
			.where(eq(decisionClause.decisionId, recorded.id))
			.all();

		// A later version renumbering the clause changes nothing here: the
		// community decided about the clause that carried that number then.
		db.update(communityStandard).set({ version: '0.2' }).run();

		const after = db
			.select()
			.from(decisionClause)
			.where(eq(decisionClause.decisionId, recorded.id))
			.all();
		expect(after).toEqual(before);
		expect(after[0]!.version).toBe('0.1');
	});
});

describe('re-freezing supersedes rather than rewrites', () => {
	it('marks the old decision superseded and names its replacement', () => {
		const first = freezeIt(ctx, threadWithProposal().id);
		const second = freezeIt(
			ctx,
			threadWithProposal(ctx, 'Members may leave with 30 days notice.').id
		);

		const older = db.select().from(decision).where(eq(decision.id, first.id)).get()!;
		expect(older.status).toBe('superseded');
		expect(older.supersededById).toBe(second.id);

		// And nothing about it changed.
		expect(older.ref).toBe(first.ref);
		expect(older.proposalText).toBe(first.proposalText);
		expect(older.tallyFor).toBe(first.tallyFor);
	});

	it('leaves the old permalink resolving', () => {
		const first = freezeIt(ctx, threadWithProposal().id);
		freezeIt(ctx, threadWithProposal(ctx, 'A newer rule.').id);

		expect(getDecisionByRef(ctx, first.ref, { db }).id).toBe(first.id);
	});

	it('keeps one coverage row for the clause', () => {
		freezeIt(ctx, threadWithProposal().id);
		freezeIt(ctx, threadWithProposal(ctx, 'A newer rule.').id);

		const covered = db.select().from(clauseCoverage).all();
		expect(new Set(covered.map((c) => c.clauseKey)).size).toBe(covered.length);
	});
});

describe('unresolved objections are recorded, permanently', () => {
	it('counts them onto the decision', () => {
		const thread = threadWithProposal();
		const proposal = db
			.select()
			.from(post)
			.all()
			.find((p) => p.kind === 'proposal')!;
		raiseObjection(
			memberCtx,
			{ proposalPostId: proposal.id, reason: 'Nothing about assets.' },
			{ db }
		);

		// Freezing over an open objection is allowed: the community's own rule
		// decides that, not this software.
		expect(freezeIt(ctx, thread.id).unresolvedObjections).toBe(1);
	});

	it('records none when they were all resolved first', () => {
		expect(freezeIt(ctx, threadWithProposal().id).unresolvedObjections).toBe(0);
	});
});

describe('decisions taken before a Decision Matrix are provisional', () => {
	it('marks the decision and the definition provisional', () => {
		const recorded = freezeIt(ctx, threadWithProposal().id);
		expect(recorded.provisional).toBe(true);
		expect(db.select().from(definition).all()[0]!.provisional).toBe(true);
	});

	it('lists nothing for ratification while the Matrix is still incomplete', () => {
		freezeIt(ctx, threadWithProposal().id);
		// There is nothing to ratify *against* yet, so the sweep is empty rather
		// than listing every decision the community has ever taken.
		expect(awaitingRatification(ctx, { db })).toEqual([]);
	});
});

describe('the offline path records how it was reached', () => {
	it('marks the decision as taken offline', () => {
		const opened = openDiscussion(
			ctx,
			{ title: 'Exit', about: { kind: 'clause', clauseKey: COUNTABLE.key } },
			{ db }
		);
		takeOffline(
			ctx,
			{ discussionId: opened.id, summary: 'Assembly of 12 June.', proposal: 'The rule.' },
			{ db }
		);

		expect(freezeIt(ctx, opened.id).source).toBe('offline');
	});
});

describe('who may record, and when', () => {
	it('refuses a plain member', () => {
		const thread = threadWithProposal();
		expect(catchRefusal(() => freezeIt(memberCtx, thread.id))?.status).toBe(403);
		expect(db.select().from(decision).all()).toHaveLength(0);
	});

	it('refuses a thread with no proposal, and says what to do', () => {
		const opened = openDiscussion(
			ctx,
			{ title: 'Just talking', about: { kind: 'clause', clauseKey: COUNTABLE.key } },
			{ db }
		);
		const refusal = catchRefusal(() => freezeIt(ctx, opened.id));
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/no proposal to record/i);
	});

	it('refuses while the community is suspended, and still serves reads', () => {
		const thread = threadWithProposal();
		const suspended: Ctx = {
			...ctx,
			community: { ...ctx.community, status: 'suspended', suspendedReason: 'Non-payment.' }
		};

		expect(catchRefusal(() => freezeIt(suspended, thread.id))?.status).toBe(409);
		expect(() => listDecisions(suspended, { db })).not.toThrow();
	});

	it('answers for another community-s decision as if it does not exist', () => {
		const recorded = freezeIt(ctx, threadWithProposal().id);
		const other = seedCommunity('other-place');

		expect(catchRefusal(() => getDecisionByRef(other.ctx, recorded.ref, { db }))?.status).toBe(404);
	});
});

describe('the platform writes the Ratification Record', () => {
	it('has none while the artifact is unfinished', () => {
		freezeIt(ctx, threadWithProposal().id);
		expect(ratificationRecord(ctx, view.section(COUNTABLE.owner!)!.artifact, { db })).toBeNull();
	});

	it('names the decision that completed *this* artifact, not the latest anywhere', () => {
		// Read across the whole community standard, the newest adoption is whichever
		// section anyone answered most recently — so a finished artifact cited a
		// decision from an entirely different one, and every Ratification Record
		// filled from it pointed at the wrong week.
		const owners = new Set(
			view
				.countableClauses()
				.map((clause) => clause.owner)
				.filter((owner): owner is string => owner !== null)
		);
		const small = view.artifacts.find((artifact) => {
			const authored = view.authoredSectionsOf(artifact.key);
			return authored.length === 1 && authored.every((section) => owners.has(section.key));
		})!;
		const section = view.authoredSectionsOf(small.key)[0]!;
		const clause = view.countableClauses().find((c) => c.owner === section.key)!;

		// Complete the small artifact…
		const thread = openDiscussion(
			ctx,
			{ title: 'The one section', about: { kind: 'clause', clauseKey: clause.key } },
			{ db }
		);
		addProposal(ctx, { discussionId: thread.id, body: 'What we decided.' }, { db });
		const completing = freezeIt(ctx, thread.id);
		expect(ratificationRecord(ctx, small.key, { db })?.ref).toBe(completing.ref);

		// …then answer something belonging to a different artifact, later.
		const later: Ctx = { ...ctx, now: () => NOW + 86_400_000 };
		const elsewhere = freezeIt(later, threadWithProposal(later).id);
		expect(view.section(COUNTABLE.owner!)!.artifact).not.toBe(small.key);
		expect(elsewhere.ref).not.toBe(completing.ref);

		// The record still points at what actually completed it.
		expect(ratificationRecord(ctx, small.key, { db })?.ref).toBe(completing.ref);
	});

	it('creates no definition row for it', () => {
		freezeIt(ctx, threadWithProposal().id);
		// Every row in `definition` is text a person wrote. A synthesised one would
		// be the single row whose author is the system.
		const rows = db.select().from(definition).all();
		expect(rows.every((row) => row.sectionKey !== null)).toBe(true);
		expect(rows.every((row) => !row.sectionKey!.endsWith('ratification-record'))).toBe(true);
	});
});

describe('the freeze carries a review date and who was present', () => {
	it('records a review date, and its absence is not an error', () => {
		const thread = threadWithProposal();
		const withDate = freezeIt(ctx, thread.id, { reviewDueAt: Date.UTC(2027, 7, 1) });
		expect(withDate.reviewDueAt?.getTime()).toBe(Date.UTC(2027, 7, 1));

		const other = threadWithProposal(ctx, 'A second rule.');
		const without = freezeIt(ctx, other.id);
		expect(without.reviewDueAt).toBeNull();
	});

	it('stores an attendee who did not consent to be named, and still counts them', () => {
		const thread = threadWithProposal();
		const recorded = freezeIt(ctx, thread.id, {
			attendees: [
				{ membershipId: ctx.membership.id, consentedToPublish: false },
				{ externalName: 'A neighbour', consentedToPublish: true }
			]
		});

		const rows = db
			.select()
			.from(decisionAttendee)
			.where(eq(decisionAttendee.decisionId, recorded.id))
			.all();

		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.membershipId === ctx.membership.id)!.consentedToPublish).toBe(
			false
		);
	});
});

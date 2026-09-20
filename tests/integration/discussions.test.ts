import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	communityArtifact,
	definition,
	definitionVersion
} from '../../src/lib/server/db/schema/definitions.js';
import { discussion, post } from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import {
	addMessage,
	addProposal,
	getDiscussion,
	latestProposal,
	listDiscussionSummaries,
	listDiscussions,
	listPosts,
	openDiscussion,
	proposalToFreeze,
	takeOffline
} from '../../src/lib/server/services/discussions.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The `discussions` capability. UI spec §5.1.
 *
 * The two lines these tests keep drawing: a proposal is a first-class thing that
 * a freeze can adopt and a message is not, and the offline path is an equal
 * route to the same freeze rather than a lesser one.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let memberCtx: Ctx;
let artifactId: string;

function seedCommunity(slug: string, email: string) {
	const person = makeUser(db, { email });
	const community = makeCommunity(db, { slug });
	const steward = makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true });

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

	const artifact = newId();
	db.insert(communityArtifact)
		.values({
			id: artifact,
			communityId: community.id,
			title: 'Community Agreements',
			description: null,
			layer: null,
			order: 0,
			kind: 'default',
			createdAt: new Date(NOW)
		})
		.run();

	return {
		artifactId: artifact,
		community,
		ctx: { user: person, community, membership: steward, now: () => NOW } satisfies Ctx
	};
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const seeded = seedCommunity('valle-verde', 'ana@example.org');
	ctx = seeded.ctx;
	artifactId = seeded.artifactId;

	const person = makeUser(db, { email: 'lena@example.org', name: 'Lena Vogt' });
	const membership = makeMembership(db, ctx.community.id, person.id, { role: 'member' });
	memberCtx = { ...ctx, user: person, membership };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const open = (title = 'Exit and separation') =>
	openDiscussion(ctx, { title, about: { kind: 'clause', clauseKey: '3.6.1' } }, { db });

/**
 * A local definition this community has already frozen.
 *
 * The clutter rule's useful half compares a line against what is *adopted*, so
 * a draft is not enough. Created through the service — a definition has check
 * constraints a hand-written row would have to restate — and then adopted
 * directly, because going through the freeze here would be testing `decisions`
 * rather than the linter's input.
 */
function adoptLocal(title: string, body: string): string {
	const created = createDefinition(
		ctx,
		{ scope: 'local', title, attach: { kind: 'community_artifact', artifactId } },
		{ db }
	);
	const versionId = newId();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId: created.id,
			n: 1,
			body,
			plainLanguage: null,
			type: null,
			authorId: ctx.user.id,
			aiAssisted: false,
			aiTask: null,
			linterResult: null,
			createdAt: new Date(NOW),
			adoptedAt: new Date(NOW),
			decisionId: null,
			supersedesVersionId: null
		})
		.run();
	db.update(definition)
		.set({ adoptedVersionId: versionId })
		.where(eq(definition.id, created.id))
		.run();
	return created.id;
}

describe('a discussion belongs to one community and one subject', () => {
	it('opens against a clause that has no definition yet', () => {
		const opened = open();
		expect(opened.definitionId).toBeNull();
		expect(opened.status).toBe('open');
	});

	it('stores the stable key, whichever of a clause-s two names was typed', () => {
		// Members are shown references — the standard browser prints "3.6.1" — and
		// everything downstream matches on the key. Storing what was typed left a
		// thread the dashboard could not see, so it kept inviting people to start
		// the discussion that already existed.
		const view = getStandard('rcos-core', '0.1');
		const clause = view.clauseByRef('3.6.1')!;
		expect(clause.key).not.toBe(clause.ref);

		const byRef = openDiscussion(
			ctx,
			{ title: 'Typed the reference', about: { kind: 'clause', clauseKey: clause.ref } },
			{ db }
		);
		const byKey = openDiscussion(
			ctx,
			{ title: 'Typed the key', about: { kind: 'clause', clauseKey: clause.key } },
			{ db }
		);

		expect(byRef.clauseKey).toBe(clause.key);
		expect(byKey.clauseKey).toBe(clause.key);
	});

	it('opens against an existing definition', () => {
		const created = createDefinition(
			ctx,
			{ scope: 'local', title: 'Quiet hours', attach: { kind: 'community_artifact', artifactId } },
			{ db }
		);
		const opened = openDiscussion(
			ctx,
			{
				title: 'Should quiet hours start at 21:00?',
				about: { kind: 'definition', definitionId: created.id }
			},
			{ db }
		);
		expect(opened.definitionId).toBe(created.id);
	});

	it('opens a thread about nothing in the standard', () => {
		// The form says "Clause (optional)". It used to be faked with the clause key
		// "unassigned", which no standard contains — so the thread could be
		// discussed and proposed on, and the freeze then refused it forever.
		const opened = openDiscussion(
			ctx,
			{ title: 'Should we keep chickens?', about: { kind: 'open_question' } },
			{ db }
		);
		expect(opened.clauseKey).toBeNull();
		expect(opened.definitionId).toBeNull();
	});

	it('refuses a clause the standard does not have, at the point of typing it', () => {
		const refusal = catchRefusal(() =>
			openDiscussion(
				ctx,
				{ title: 'About nothing', about: { kind: 'clause', clauseKey: 'unassigned' } },
				{ db }
			)
		);
		expect(refusal?.status).toBe(400);
	});

	it('refuses a definition belonging to another community', () => {
		const other = seedCommunity('other-place', 'marco@example.org');
		const theirs = createDefinition(
			other.ctx,
			{
				scope: 'local',
				title: 'Theirs',
				attach: { kind: 'community_artifact', artifactId: other.artifactId }
			},
			{ db }
		);

		// A thread would otherwise be a way to learn their definition exists.
		expect(() =>
			openDiscussion(
				ctx,
				{ title: 'About theirs', about: { kind: 'definition', definitionId: theirs.id } },
				{ db }
			)
		).toThrow(expect.objectContaining({ status: 404 }));
	});

	it('answers for another community-s discussion as if it does not exist', () => {
		const other = seedCommunity('other-place', 'marco@example.org');
		const theirs = openDiscussion(
			other.ctx,
			{ title: 'Theirs', about: { kind: 'clause', clauseKey: '3.6.1' } },
			{ db }
		);

		expect(() => getDiscussion(ctx, theirs.id, { db })).toThrow(
			expect.objectContaining({ status: 404 })
		);
	});

	it('lists only its own community-s discussions, newest activity first', () => {
		const other = seedCommunity('other-place', 'marco@example.org');
		openDiscussion(
			other.ctx,
			{ title: 'Theirs', about: { kind: 'clause', clauseKey: '3.6.1' } },
			{ db }
		);

		const first = open('First');
		const second = open('Second');
		// Activity, not creation: a reply to the older thread moves it up.
		addMessage(
			{ ...ctx, now: () => NOW + 1000 },
			{ discussionId: first.id, body: 'A reply.' },
			{ db }
		);

		const listed = listDiscussions(ctx, { db });
		expect(listed.map((d) => d.title)).toEqual(['First', 'Second']);
		expect(listed).toHaveLength(2);
		expect(second.communityId).toBe(ctx.community.id);
	});
});

/**
 * The list screen's own row. Design screen 10.
 *
 * Three of these five facts are not columns anywhere — they are derived, and the
 * point of the tests is that they stay derived from the right thing. `in vote`
 * in particular must never go back to reading `discussion.status`: nothing
 * writes that value, so a filter built on it counts nothing forever.
 */
describe('a proposal is linted against what the community already made binding', () => {
	it('names the adopted definition a proposal restates', () => {
		// `adoptedElsewhere` had no production caller at all, so the only clutter
		// finding that could ever reach a member was the generic one.
		const body = 'Land and buildings are held in common by the whole circle.';
		adoptLocal('What we hold in common', body);

		const opened = open('Restating the commons');
		const written = addProposal(ctx, { discussionId: opened.id, body }, { db });

		const stored = db.select().from(post).where(eq(post.id, written.id)).get()!;
		const result = stored.linterResult as {
			lines: { findings: { rule: string; message: string }[] }[];
		};
		const clutter = result.lines
			.flatMap((line) => line.findings)
			.find((finding) => finding.rule === 'line.clutter')!;
		expect(clutter.message).toContain('What we hold in common');
	});

	it('does not ask a proposal for a plain-language mirror it has no field for', () => {
		const opened = open('Exit');
		const written = addProposal(
			ctx,
			{ discussionId: opened.id, body: 'Members may leave.' },
			{ db }
		);
		const stored = db.select().from(post).where(eq(post.id, written.id)).get()!;
		const result = stored.linterResult as { bodyFindings: { rule: string }[] };
		expect(result.bodyFindings.map((finding) => finding.rule)).not.toContain('all.plain');
	});
});

describe('a discussion summary says what a row has to say', () => {
	it('names who has spoken, in the order they first did, and what happened last', () => {
		const opened = open('Exit');
		addMessage(ctx, { discussionId: opened.id, body: 'Ana opens.' }, { db });
		addMessage(
			{ ...memberCtx, now: () => NOW + 1000 },
			{ discussionId: opened.id, body: 'Lena answers.' },
			{ db }
		);
		addMessage(
			{ ...ctx, now: () => NOW + 2000 },
			{ discussionId: opened.id, body: 'Ana again.' },
			{ db }
		);

		const [row] = listDiscussionSummaries(ctx, { db });
		expect(row!.people.map((person) => person.label)).toEqual(['Test Person', 'Lena Vogt']);
		expect(row!.last?.author.label).toBe('Test Person');
		expect(row!.last?.kind).toBe('message');
		expect(row!.version).toBeNull();
	});

	it('carries the newest proposal version, so the row can say which text is on the table', () => {
		const opened = open('Exit');
		addProposal(ctx, { discussionId: opened.id, body: 'Members may leave.' }, { db });
		addProposal(
			{ ...ctx, now: () => NOW + 1000 },
			{ discussionId: opened.id, body: 'Members may leave with notice.' },
			{ db }
		);

		const [row] = listDiscussionSummaries(ctx, { db });
		expect(row!.version).toBe(2);
		expect(row!.last?.kind).toBe('proposal');
	});

	it('reads "in vote" from an open round rather than from a column nothing writes', () => {
		const opened = open('Exit');
		const proposal = addProposal(
			ctx,
			{ discussionId: opened.id, body: 'Members may leave.' },
			{ db }
		);

		// The column says `open` and always will: opening a round does not touch
		// the thread, and nothing in the product sets `in_vote`.
		expect(listDiscussionSummaries(ctx, { db })[0]!.inVote).toBe(false);

		getVotingProvider().respond(
			memberCtx,
			{ proposalPostId: proposal.id, value: 'consent' },
			{ db }
		);

		const [row] = listDiscussionSummaries(ctx, { db });
		expect(row!.status).toBe('open');
		expect(row!.inVote).toBe(true);
	});

	it('waits on the member who has not answered, and stops waiting on the one who has', () => {
		const opened = open('Exit');
		const proposal = addProposal(
			ctx,
			{ discussionId: opened.id, body: 'Members may leave.' },
			{ db }
		);
		getVotingProvider().respond(
			memberCtx,
			{ proposalPostId: proposal.id, value: 'consent' },
			{ db }
		);

		// Lena answered; Ana was made eligible by the same round and has not.
		expect(listDiscussionSummaries(memberCtx, { db })[0]!.waitingOnMe).toBe(false);
		expect(listDiscussionSummaries(ctx, { db })[0]!.waitingOnMe).toBe(true);

		getVotingProvider().respond(ctx, { proposalPostId: proposal.id, value: 'abstain' }, { db });
		expect(listDiscussionSummaries(ctx, { db })[0]!.waitingOnMe).toBe(false);
	});

	it('stops saying "in vote" once the text that was in vote has been replaced', () => {
		const opened = open('Exit');
		const v1 = addProposal(ctx, { discussionId: opened.id, body: 'Members may leave.' }, { db });
		getVotingProvider().respond(memberCtx, { proposalPostId: v1.id, value: 'consent' }, { db });
		expect(listDiscussionSummaries(ctx, { db })[0]!.inVote).toBe(true);

		// Writing v2 supersedes v1's round. Lena's consent stays where it is — it
		// is what v1 was told — but the community is no longer being asked it.
		addProposal(
			{ ...ctx, now: () => NOW + 1000 },
			{ discussionId: opened.id, body: 'Members may leave with notice.' },
			{ db }
		);

		const [row] = listDiscussionSummaries(ctx, { db });
		expect(row!.inVote).toBe(false);
		expect(row!.waitingOnMe).toBe(false);
		expect(row!.version).toBe(2);
	});

	it('stops waiting when the deadline has gone, without writing to say so', () => {
		const opened = open('Exit');
		const proposal = addProposal(
			ctx,
			{ discussionId: opened.id, body: 'Members may leave.' },
			{ db }
		);
		getVotingProvider().openRound(
			ctx,
			{ proposalPostId: proposal.id, closesAt: NOW + 86_400_000 },
			{ db }
		);

		expect(listDiscussionSummaries(ctx, { db })[0]!.waitingOnMe).toBe(true);

		// A list is a read. The round is still `open` in the table until something
		// writes to close it; the row must not claim it is waiting on anybody.
		const later = { ...ctx, now: () => NOW + 2 * 86_400_000 };
		const [row] = listDiscussionSummaries(later, { db });
		expect(row!.waitingOnMe).toBe(false);
		expect(row!.inVote).toBe(false);
	});
});

describe('a proposal is a first-class object, not a post that looks different', () => {
	it('numbers proposals within the thread and keeps the earlier ones readable', () => {
		const opened = open();
		const v1 = addProposal(ctx, { discussionId: opened.id, body: 'Members may leave.' }, { db });
		const v2 = addProposal(
			ctx,
			{ discussionId: opened.id, body: 'Members may leave with notice.' },
			{ db }
		);

		expect(v1.proposalVersion).toBe(1);
		expect(v2.proposalVersion).toBe(2);

		const posts = listPosts(ctx, opened.id, { db });
		expect(posts.map((p) => p.body)).toContain('Members may leave.');
		expect(latestProposal(ctx, opened.id, { db })!.id).toBe(v2.id);
	});

	it('does not number a message, so any number of them coexist', () => {
		const opened = open();
		addMessage(ctx, { discussionId: opened.id, body: 'What about pets?' }, { db });
		addMessage(ctx, { discussionId: opened.id, body: 'And bikes?' }, { db });

		const posts = listPosts(ctx, opened.id, { db });
		expect(posts.every((p) => p.kind !== 'proposal' || p.proposalVersion !== null)).toBe(true);
		expect(posts.filter((p) => p.kind === 'message')).toHaveLength(2);
		expect(latestProposal(ctx, opened.id, { db })).toBeNull();
	});

	it('refuses a freeze with nothing to record, and says what to do', () => {
		const opened = open();
		addMessage(ctx, { discussionId: opened.id, body: 'Just talking.' }, { db });

		const refusal = catchRefusal(() => proposalToFreeze(ctx, opened.id, { db }));
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/no proposal to record/i);
	});

	it('offers the latest proposal to the freeze', () => {
		const opened = open();
		addProposal(ctx, { discussionId: opened.id, body: 'v1' }, { db });
		const v2 = addProposal(ctx, { discussionId: opened.id, body: 'v2' }, { db });

		expect(proposalToFreeze(ctx, opened.id, { db }).id).toBe(v2.id);
	});

	it('refuses a proposal that has already been recorded', () => {
		const opened = open();
		const proposal = addProposal(ctx, { discussionId: opened.id, body: 'v1' }, { db });
		// Group 5 sets this inside the freeze transaction; the guard is here.
		db.update(post)
			.set({ frozenDecisionId: 'some-decision' })
			.where(eq(post.id, proposal.id))
			.run();

		expect(() => proposalToFreeze(ctx, opened.id, { db })).toThrow(
			expect.objectContaining({ status: 409 })
		);
	});
});

describe('deciding in a room is a first-class path', () => {
	it('records the summary, who wrote it, and the proposal it produced', () => {
		const opened = open();
		const { summary, proposal } = takeOffline(
			ctx,
			{
				discussionId: opened.id,
				summary: 'Discussed at the assembly of 12 June; agreed unanimously.',
				proposal: 'Members may leave at any time.'
			},
			{ db }
		);

		expect(summary.kind).toBe('offline_summary');
		expect(summary.authorId).toBe(ctx.user.id);
		expect(summary.createdAt.getTime()).toBe(NOW);

		// What came out of the room is an ordinary proposal, so the freeze that
		// follows asks for exactly what it asks for online.
		expect(proposal.kind).toBe('proposal');
		expect(proposal.proposalVersion).toBe(1);
		expect(proposalToFreeze(ctx, opened.id, { db }).id).toBe(proposal.id);
	});

	it('marks the thread so the decision can record how it was reached', () => {
		const opened = open();
		takeOffline(
			ctx,
			{ discussionId: opened.id, summary: 'In the room.', proposal: 'The rule.' },
			{ db }
		);

		const after = getDiscussion(ctx, opened.id, { db });
		expect(after.status).toBe('decided_offline');
		expect(after.origin).toBe('offline');
	});

	it('continues the numbering when a thread went online first', () => {
		const opened = open();
		addProposal(ctx, { discussionId: opened.id, body: 'v1 online' }, { db });

		const { proposal } = takeOffline(
			ctx,
			{ discussionId: opened.id, summary: 'Then we met.', proposal: 'v2 from the room' },
			{ db }
		);
		expect(proposal.proposalVersion).toBe(2);
	});

	it('insists on both the summary and the proposal', () => {
		const opened = open();
		expect(() =>
			takeOffline(ctx, { discussionId: opened.id, summary: '  ', proposal: 'x' }, { db })
		).toThrow(expect.objectContaining({ status: 400 }));
		expect(() =>
			takeOffline(ctx, { discussionId: opened.id, summary: 'x', proposal: '  ' }, { db })
		).toThrow(expect.objectContaining({ status: 400 }));

		// Neither half was written: the pair is one act.
		expect(listPosts(ctx, opened.id, { db })).toHaveLength(0);
	});
});

describe('a member may propose; recording remains with a steward', () => {
	it('lets a plain member open a discussion, comment and propose', () => {
		const opened = openDiscussion(
			memberCtx,
			{ title: 'Can we keep chickens?', about: { kind: 'clause', clauseKey: '3.6.1' } },
			{ db }
		);
		expect(() =>
			addMessage(memberCtx, { discussionId: opened.id, body: 'I think so.' }, { db })
		).not.toThrow();
		expect(() =>
			addProposal(memberCtx, { discussionId: opened.id, body: 'Chickens allowed.' }, { db })
		).not.toThrow();
	});

	it('refuses an empty message and an empty proposal', () => {
		const opened = open();
		expect(() => addMessage(ctx, { discussionId: opened.id, body: '   ' }, { db })).toThrow(
			expect.objectContaining({ status: 400 })
		);
		expect(() => addProposal(ctx, { discussionId: opened.id, body: '' }, { db })).toThrow(
			expect.objectContaining({ status: 400 })
		);
	});
});

describe('a thread survives its decisions, and only abandoning ends it', () => {
	it('keeps taking messages and versions after a freeze', () => {
		// The same argument can come back. v5 written months after v3 was adopted
		// belongs in the thread that produced v3, and the second decision
		// supersedes the first — which is what `freeze` already does.
		const opened = open();
		db.update(discussion).set({ status: 'frozen' }).where(eq(discussion.id, opened.id)).run();

		expect(() =>
			addMessage(ctx, { discussionId: opened.id, body: 'One more thing.' }, { db })
		).not.toThrow();

		const next = addProposal(ctx, { discussionId: opened.id, body: 'Another go.' }, { db });
		expect(next.proposalVersion).toBe(1);

		// A new question on the table is an open discussion again, whatever the
		// thread had already decided.
		const after = db.select().from(discussion).where(eq(discussion.id, opened.id)).get()!;
		expect(after.status).toBe('open');
	});

	it('refuses posts once it has been abandoned', () => {
		const opened = open();
		db.update(discussion).set({ status: 'abandoned' }).where(eq(discussion.id, opened.id)).run();

		expect(() =>
			addMessage(ctx, { discussionId: opened.id, body: 'One more thing.' }, { db })
		).toThrow(expect.objectContaining({ status: 409 }));
		expect(() =>
			addProposal(ctx, { discussionId: opened.id, body: 'Another go.' }, { db })
		).toThrow(expect.objectContaining({ status: 409 }));
	});

	it('still lets everyone read an abandoned one', () => {
		const opened = open();
		addProposal(ctx, { discussionId: opened.id, body: 'The rule.' }, { db });
		db.update(discussion).set({ status: 'abandoned' }).where(eq(discussion.id, opened.id)).run();

		expect(listPosts(ctx, opened.id, { db })).toHaveLength(1);
	});
});

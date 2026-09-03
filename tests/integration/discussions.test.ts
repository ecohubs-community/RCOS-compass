import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { communityArtifact } from '../../src/lib/server/db/schema/definitions.js';
import { discussion, post } from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import {
	addMessage,
	addProposal,
	getDiscussion,
	latestProposal,
	listDiscussions,
	listPosts,
	openDiscussion,
	proposalToFreeze,
	takeOffline
} from '../../src/lib/server/services/discussions.js';
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

	const person = makeUser(db, { email: 'lena@example.org' });
	const membership = makeMembership(db, ctx.community.id, person.id, { role: 'member' });
	memberCtx = { ...ctx, user: person, membership };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const open = (title = 'Exit and separation') =>
	openDiscussion(ctx, { title, about: { kind: 'clause', clauseKey: '3.6.1' } }, { db });

describe('a discussion belongs to one community and one subject', () => {
	it('opens against a clause that has no definition yet', () => {
		const opened = open();
		expect(opened.clauseKey).toBe('3.6.1');
		expect(opened.definitionId).toBeNull();
		expect(opened.status).toBe('open');
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

describe('a decided thread takes no more writes', () => {
	it('refuses posts once it has been frozen', () => {
		const opened = open();
		db.update(discussion).set({ status: 'frozen' }).where(eq(discussion.id, opened.id)).run();

		expect(() =>
			addMessage(ctx, { discussionId: opened.id, body: 'One more thing.' }, { db })
		).toThrow(expect.objectContaining({ status: 409 }));
		expect(() =>
			addProposal(ctx, { discussionId: opened.id, body: 'Another go.' }, { db })
		).toThrow(expect.objectContaining({ status: 409 }));
	});

	it('still lets everyone read it', () => {
		const opened = open();
		addProposal(ctx, { discussionId: opened.id, body: 'The rule.' }, { db });
		db.update(discussion).set({ status: 'frozen' }).where(eq(discussion.id, opened.id)).run();

		expect(listPosts(ctx, opened.id, { db })).toHaveLength(1);
	});
});

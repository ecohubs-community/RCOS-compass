import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { consentRound, discussion, post } from '../../src/lib/server/db/schema/discussions.js';
import { job } from '../../src/lib/server/db/schema/jobs.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { communityStandard, membership } from '../../src/lib/server/db/schema/tenancy.js';
import {
	addProposal,
	openDiscussion,
	setCurrentProposal
} from '../../src/lib/server/services/discussions.js';
import {
	answerMove,
	listMoveRequests,
	requestMove,
	withdrawMove
} from '../../src/lib/server/services/move-requests.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * A member asking for the question to be moved back. `openspec/changes/provenance-ui`
 * group 6, the `discussions` and `notifications` specs.
 */
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let bea: Ctx;
let marco: Ctx;
let lena: Ctx;
let discussionId: string;
let v1: string;
let v2: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const seat = (email: string, name: string, role: 'steward' | 'member', isOwner = false) => {
		const person = makeUser(db, { email, name });
		const seated = makeMembership(db, home.id, person.id, { role, isOwner });
		return { user: person, community: home, membership: seated, now: () => NOW } satisfies Ctx;
	};
	ana = seat('ana@example.org', 'Ana Ruiz', 'steward', true);
	bea = seat('bea@example.org', 'Bea Kim', 'steward');
	marco = seat('marco@example.org', 'Marco Bianchi', 'member');
	lena = seat('lena@example.org', 'Lena Vogt', 'member');

	discussionId = openDiscussion(
		ana,
		{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: '3.6.1' } },
		{ db }
	).id;
	v1 = addProposal(ana, { discussionId, body: 'Members may leave.' }, { db }).id;
	getVotingProvider().respond(marco, { proposalPostId: v1, value: 'consent' }, { db });
	v2 = addProposal(ana, { discussionId, body: 'Members may leave with notice.' }, { db }).id;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const current = () =>
	db.select().from(discussion).where(eq(discussion.id, discussionId)).get()!.currentProposalPostId;
const ask = (who: Ctx = marco, target = v1, reason = 'v1 was simpler.') =>
	requestMove(who, { discussionId, targetProposalPostId: target, reason }, { db });
const told = (who: Ctx, kind: string) =>
	db
		.select()
		.from(notification)
		.where(
			and(eq(notification.recipientMembershipId, who.membership.id), eq(notification.kind, kind))
		)
		.all();

describe('a member asks to put an earlier version back', () => {
	it('records a post and an open request, and moves nothing', () => {
		const request = ask();

		expect(request.state).toBe('open');
		expect(current()).toBe(v2);
		const said = db.select().from(post).where(eq(post.id, request.postId)).get()!;
		expect(said).toMatchObject({
			kind: 'move_request',
			body: 'v1 was simpler.',
			subjectPostId: v1
		});
		expect(listMoveRequests(lena, discussionId, { db })[0]).toMatchObject({
			targetVersion: 1,
			fromVersion: 2,
			requestedBy: 'Marco Bianchi',
			state: 'open',
			mine: false
		});
	});

	it('refuses the version already on the table', () => {
		expect(catchRefusal(() => ask(marco, v2))?.status).toBe(409);
	});

	it('refuses a second open request from the same member, naming the first', () => {
		ask();
		const refusal = catchRefusal(() => ask(marco, v1, 'Again.'));
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toContain('v1');
	});

	it('refuses a request with no reason', () => {
		expect(catchRefusal(() => ask(marco, v1, '  '))?.status).toBe(400);
	});

	it('lets the requester withdraw it, and nobody else', () => {
		const request = ask();
		expect(catchRefusal(() => withdrawMove(lena, { requestId: request.id }, { db }))?.status).toBe(
			403
		);
		expect(withdrawMove(marco, { requestId: request.id }, { db }).state).toBe('withdrawn');
		expect(listMoveRequests(ana, discussionId, { db })[0]!.state).toBe('withdrawn');
	});
});

describe('a steward answers', () => {
	it('grants: the question moves exactly as putting it back does', () => {
		const request = ask();
		const answered = answerMove(ana, { requestId: request.id, grant: true }, { db });

		expect(current()).toBe(v1);
		expect(answered).toMatchObject({ state: 'granted', answeredBy: ana.user.id });
		const round = db.select().from(consentRound).where(eq(consentRound.proposalPostId, v1)).get()!;
		expect(round.status).toBe('open');
		const moved = db
			.select()
			.from(post)
			.all()
			.filter((row) => row.kind === 'event');
		expect(moved.at(-1)!.body).toMatch(/^Put v1 back on the table, from v2/);
		expect(listMoveRequests(marco, discussionId, { db })[0]).toMatchObject({
			state: 'granted',
			answeredBy: 'Ana Ruiz'
		});
	});

	it('declines with a note, and the question stays', () => {
		const request = ask();
		answerMove(
			ana,
			{ requestId: request.id, grant: false, note: 'v2 fixes the notice period; let’s finish it' },
			{ db }
		);
		expect(current()).toBe(v2);
		expect(listMoveRequests(marco, discussionId, { db })[0]).toMatchObject({
			state: 'declined',
			answerNote: 'v2 fixes the notice period; let’s finish it'
		});
	});

	it('refuses a decline with no note, and the request stays open', () => {
		const request = ask();
		const refusal = catchRefusal(() =>
			answerMove(ana, { requestId: request.id, grant: false, note: ' ' }, { db })
		);
		expect(refusal?.status).toBe(400);
		expect(listMoveRequests(ana, discussionId, { db })[0]!.state).toBe('open');
	});

	it('refuses a member granting, and the question does not move', () => {
		const request = ask();
		expect(
			catchRefusal(() => answerMove(lena, { requestId: request.id, grant: true }, { db }))?.status
		).toBe(403);
		expect(current()).toBe(v2);
	});

	it('refuses answering twice', () => {
		const request = ask();
		answerMove(ana, { requestId: request.id, grant: false, note: 'No.' }, { db });
		expect(
			catchRefusal(() => answerMove(bea, { requestId: request.id, grant: true }, { db }))?.status
		).toBe(409);
	});
});

describe('a request is settled when the question moves anyway', () => {
	it('reads granted, by whoever moved it, when a steward puts the version back directly', () => {
		const request = ask();
		setCurrentProposal(bea, { discussionId, proposalPostId: v1 }, { db });
		expect(
			listMoveRequests(marco, discussionId, { db }).find((r) => r.id === request.id)
		).toMatchObject({ state: 'granted', answeredBy: 'Bea Kim' });
	});

	it('lapses when a newer version is posted', () => {
		ask();
		addProposal(lena, { discussionId, body: 'Members may leave after a conversation.' }, { db });
		expect(listMoveRequests(marco, discussionId, { db })[0]!.state).toBe('lapsed');
	});
});

describe('who is told', () => {
	it('tells every steward when a member asks, by email too', () => {
		ask();
		expect(told(ana, 'proposal.move_requested')).toHaveLength(1);
		expect(told(bea, 'proposal.move_requested')).toHaveLength(1);
		expect(told(lena, 'proposal.move_requested')).toHaveLength(0);
		expect(told(ana, 'proposal.move_requested')[0]!.params).toMatchObject({
			version: 1,
			actor: marco.membership.id
		});
		expect(
			db
				.select()
				.from(job)
				.all()
				.filter((row) => row.kind === 'notification-mail').length
		).toBeGreaterThanOrEqual(2);
	});

	it('tells the other stewards when a steward asks, and not the asker', () => {
		ask(ana);
		expect(told(ana, 'proposal.move_requested')).toHaveLength(0);
		expect(told(bea, 'proposal.move_requested')).toHaveLength(1);
	});

	it('does not tell a steward who has left', () => {
		db.update(membership)
			.set({ endedAt: new Date(NOW) })
			.where(eq(membership.id, bea.membership.id))
			.run();
		ask();
		expect(told(bea, 'proposal.move_requested')).toHaveLength(0);
		expect(told(ana, 'proposal.move_requested')).toHaveLength(1);
	});

	it('tells the requester the outcome', () => {
		const declined = ask();
		answerMove(ana, { requestId: declined.id, grant: false, note: 'Not now.' }, { db });
		expect(told(marco, 'proposal.move_answered')[0]!.params).toMatchObject({
			outcome: 'declined',
			version: 1
		});

		ask(lena);
		addProposal(ana, { discussionId, body: 'A third text.' }, { db });
		expect(told(lena, 'proposal.move_answered')[0]!.params).toMatchObject({ outcome: 'lapsed' });
	});
});

describe('another community', () => {
	it('cannot see or answer a request', () => {
		const request = ask();
		const elsewhere = makeCommunity(db, { slug: 'elsewhere' });
		const outsider = makeUser(db, { email: 'olga@example.org' });
		const seat = makeMembership(db, elsewhere.id, outsider.id, { role: 'steward', isOwner: true });
		const olga: Ctx = { user: outsider, community: elsewhere, membership: seat, now: () => NOW };

		expect(
			catchRefusal(() => answerMove(olga, { requestId: request.id, grant: true }, { db }))?.status
		).toBe(404);
		expect(
			catchRefusal(() =>
				requestMove(olga, { discussionId, targetProposalPostId: v1, reason: 'x' }, { db })
			)?.status
		).toBe(404);
		expect(current()).toBe(v2);
	});
});

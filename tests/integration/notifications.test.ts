import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { communityStandard, membership } from '../../src/lib/server/db/schema/tenancy.js';
import {
	countActivity,
	digestMessage,
	sendWeeklyDigests
} from '../../src/lib/server/jobs/digest.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import {
	addMessage,
	addProposal,
	openDiscussion
} from '../../src/lib/server/services/discussions.js';
import {
	listNotifications,
	markRead,
	unreadCount
} from '../../src/lib/server/services/notifications.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * What a member is told, and what an inbox is never told. UI spec §4.11,
 * docs/04-security.md §4.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const DAY = 86_400_000;
const clause = getStandard('rcos-core', '0.1').countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let marco: Ctx;
let lena: Ctx;
let mail: ReturnType<typeof memoryTransport>;

function seedCommunity(slug: string, emails: string[]) {
	const community = makeCommunity(db, { slug });
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

	return emails.map((email, i) => {
		const person = makeUser(db, { email });
		const seat = makeMembership(db, community.id, person.id, {
			role: i === 0 ? 'steward' : 'member',
			isOwner: i === 0
		});
		return { user: person, community, membership: seat, now: () => NOW } satisfies Ctx;
	});
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	mail = memoryTransport();
	setMailTransportForTests(mail);

	[ana, marco, lena] = seedCommunity('valle-verde', [
		'ana@example.org',
		'marco@example.org',
		'lena@example.org'
	]) as [Ctx, Ctx, Ctx];
});

afterEach(() => {
	setDbForTests(null);
	resetMailTransportForTests();
	cleanup();
});

function threadWith(who: Ctx, others: Ctx[] = []) {
	const opened = openDiscussion(
		who,
		{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: clause.key } },
		{ db }
	);
	for (const other of others) {
		addMessage(other, { discussionId: opened.id, body: 'I have thoughts.' }, { db });
	}
	return opened;
}

describe('a member is told what happened where they can act on it', () => {
	it('tells the people who have written in a thread about a new proposal', () => {
		const thread = threadWith(ana, [marco]);
		addProposal(ana, { discussionId: thread.id, body: 'Members may leave.' }, { db });

		expect(listNotifications(marco, { db })).toHaveLength(1);
		expect(listNotifications(marco, { db })[0]!.kind).toBe('proposal.posted');
		// Lena never joined the thread, so she is not pulled into it.
		expect(listNotifications(lena, { db })).toHaveLength(0);
	});

	it('never tells someone about their own act', () => {
		const thread = threadWith(ana, [marco]);
		addProposal(ana, { discussionId: thread.id, body: 'Members may leave.' }, { db });

		// A list full of your own doing is a list people stop opening.
		expect(listNotifications(ana, { db })).toHaveLength(0);
	});

	it('tells everyone eligible when a consent round opens', () => {
		const thread = threadWith(ana);
		const proposal = addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		getVotingProvider().openRound(
			ana,
			{ proposalPostId: proposal.id, closesAt: NOW + DAY },
			{ db }
		);

		expect(listNotifications(marco, { db })[0]!.kind).toBe('consent.opened');
		expect(listNotifications(lena, { db })).toHaveLength(1);
	});

	it('tells the whole community when a decision is frozen', () => {
		const thread = threadWith(ana);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		freeze(
			ana,
			{
				discussionId: thread.id,
				idempotencyKey: 'k1',
				title: 'Exit and separation',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);

		// A decision is the community's record, so everyone hears about it.
		for (const who of [marco, lena]) {
			const theirs = listNotifications(who, { db });
			expect(theirs.some((n) => n.kind === 'decision.frozen')).toBe(true);
		}
	});

	it('writes the rows with the decision, not after it', () => {
		const thread = threadWith(ana);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		freeze(
			ana,
			{
				discussionId: thread.id,
				idempotencyKey: 'k1',
				title: 'Exit',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);

		// Nothing was queued and nothing was mailed: a decision that exists and
		// told nobody is one half the community finds out about by accident, and
		// mail is the digest's job precisely so it never holds this write lock.
		expect(mail.sent).toHaveLength(0);
		expect(db.select().from(notification).all().length).toBeGreaterThan(0);
	});

	it('names the community, and never crosses between two', () => {
		const [otherSteward] = seedCommunity('other-place', ['ana2@example.org']) as [Ctx];
		const thread = threadWith(ana, [marco]);
		addProposal(ana, { discussionId: thread.id, body: 'Ours.' }, { db });

		expect(listNotifications(marco, { db })[0]!.communityId).toBe(ana.community.id);
		expect(listNotifications(otherSteward, { db })).toHaveLength(0);
	});
});

describe('a member who has left is told nothing', () => {
	it('is not written to after their membership ends', () => {
		db.update(membership)
			.set({ endedAt: new Date(NOW - 1000) })
			.where(eq(membership.id, lena.membership.id))
			.run();

		const thread = threadWith(ana);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		freeze(
			ana,
			{
				discussionId: thread.id,
				idempotencyKey: 'k1',
				title: 'Exit',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);

		expect(listNotifications(lena, { db })).toHaveLength(0);
		expect(listNotifications(marco, { db }).length).toBeGreaterThan(0);
	});
});

describe('reading and marking read', () => {
	it('counts the unread and marks them', () => {
		const thread = threadWith(ana, [marco]);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });

		expect(unreadCount(marco, { db })).toBe(1);
		const [first] = listNotifications(marco, { db });
		expect(markRead(marco, [first!.id], { db })).toBe(1);
		expect(unreadCount(marco, { db })).toBe(0);
	});

	it('reports someone else-s notification as one that does not exist', () => {
		const thread = threadWith(ana, [marco]);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		const [marcos] = listNotifications(marco, { db });

		// Silently skipping it would hide a bug in the caller for a year, and it
		// is not the answer the boundary gives anywhere else.
		expect(catchRefusal(() => markRead(lena, [marcos!.id], { db }))?.status).toBe(404);
		expect(unreadCount(marco, { db })).toBe(1);
	});
});

describe('the weekly digest carries a link and no content', () => {
	function busyWeek() {
		const thread = threadWith(ana);
		addProposal(
			ana,
			{ discussionId: thread.id, body: 'A definition body nobody should read.' },
			{ db }
		);
		freeze(
			ana,
			{
				discussionId: thread.id,
				idempotencyKey: 'k1',
				title: 'Exit and separation',
				type: 'strategic',
				mechanism: 'consent',
				rationale: 'A rationale nobody outside should read.'
			},
			{ db }
		);
	}

	it('sends one message per member, with counts and a link', async () => {
		busyWeek();
		const result = await sendWeeklyDigests(
			db,
			fixedClock(NOW + DAY),
			'https://compass.example.org'
		);

		expect(result.communities).toBe(1);
		expect(result.sent).toBe(3);
		for (const message of mail.sent) {
			expect(message.text).toMatch(/1 decision was recorded/);
			expect(message.url).toBe('https://compass.example.org/c/valle-verde');
		}
	});

	it('carries no definition text, no discussion text, and no rationale', async () => {
		busyWeek();
		await sendWeeklyDigests(db, fixedClock(NOW + DAY), 'https://compass.example.org');

		for (const message of mail.sent) {
			expect(message.text).not.toContain('A definition body nobody should read.');
			expect(message.text).not.toContain('A rationale nobody outside should read.');
			// Not even the decision's title: an inbox is outside every visibility
			// control the application has.
			expect(message.text).not.toContain('Exit and separation');
		}
	});

	it('sends nothing for a quiet week', async () => {
		busyWeek();
		// Two weeks later, with nothing since.
		const result = await sendWeeklyDigests(
			db,
			fixedClock(NOW + 14 * DAY),
			'https://compass.example.org'
		);

		expect(result.communities).toBe(0);
		expect(mail.sent).toHaveLength(0);
	});

	it('does not let one bad address cost everyone else theirs', async () => {
		busyWeek();
		let attempts = 0;
		setMailTransportForTests({
			id: 'flaky',
			send: () => {
				attempts += 1;
				return attempts === 1 ? Promise.reject(new Error('no such mailbox')) : Promise.resolve();
			}
		});

		const result = await sendWeeklyDigests(
			db,
			fixedClock(NOW + DAY),
			'https://compass.example.org'
		);
		expect(result.failed).toBe(1);
		expect(result.sent).toBe(2);
	});

	it('counts a week of activity', () => {
		busyWeek();
		expect(countActivity(db, ana.community.id, NOW - DAY)).toEqual({
			decisions: 1,
			discussions: 1
		});
		expect(countActivity(db, ana.community.id, NOW + DAY)).toEqual({
			decisions: 0,
			discussions: 0
		});
	});

	it('writes the body in one place, so the rule is one function to read', () => {
		const message = digestMessage(
			'ana@example.org',
			'Valle Verde',
			{ decisions: 2, discussions: 5 },
			'https://compass.example.org/c/valle-verde'
		);
		expect(message.subject).toBe('This week in Valle Verde');
		expect(message.text).toMatch(/2 decisions were recorded/);
		expect(message.text).toMatch(/5 discussions had activity/);
	});
});

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { post } from '../../src/lib/server/db/schema/discussions.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { decision } from '../../src/lib/server/db/schema/decisions.js';
import {
	community,
	communityStandard,
	membership
} from '../../src/lib/server/db/schema/tenancy.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { erasePerson } from '../../src/lib/server/services/erasure.js';
import {
	addMessage,
	addProposal,
	mentionDirectory,
	openDiscussion
} from '../../src/lib/server/services/discussions.js';
import {
	listNotificationItems,
	listNotifications,
	markAllRead,
	openNotification,
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

		// A list full of your own doing is a list people stop opening. (Marco's
		// message is a reply Ana hears about; her own proposal is not.)
		expect(listNotifications(ana, { db }).map((n) => n.kind)).toEqual(['discussion.reply']);
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
		expect(openNotification(marco, first!.id, { db })).toEqual({
			type: 'discussion',
			id: thread.id
		});
		expect(unreadCount(marco, { db })).toBe(0);
	});

	it('counts and marks beyond the page a list shows', () => {
		// `listNotifications` is capped at 200 because a list is. The badge is not,
		// and ownership is not: reading either off that page told a member with 250
		// unread that they had 200, and answered 404 when they marked an older one
		// of their own read.
		const rows = Array.from({ length: 250 }, (_, i) => ({
			id: newId(),
			communityId: marco.community.id,
			recipientMembershipId: marco.membership.id,
			kind: 'decision.frozen' as const,
			subjectType: 'decision' as const,
			subjectId: newId(),
			summary: `Decision ${i}`,
			createdAt: new Date(marco.now() + i),
			readAt: null
		}));
		for (const row of rows) db.insert(notification).values(row).run();

		expect(unreadCount(marco, { db })).toBe(250);

		// The oldest one, which no page of the list reaches.
		const oldest = rows[0]!.id;
		// Its decision no longer exists: it is still marked read, and leads nowhere.
		expect(openNotification(marco, oldest, { db })).toBeNull();
		expect(unreadCount(marco, { db })).toBe(249);

		// The list is a page of 200; the count is every one of them.
		expect(listNotificationItems(marco, { db })).toHaveLength(200);
		expect(markAllRead(marco, { db })).toBe(249);
		expect(unreadCount(marco, { db })).toBe(0);
	});

	it('reports someone else-s notification as one that does not exist', () => {
		const thread = threadWith(ana, [marco]);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		const [marcos] = listNotifications(marco, { db });

		// Silently skipping it would hide a bug in the caller for a year, and it
		// is not the answer the boundary gives anywhere else.
		expect(catchRefusal(() => openNotification(lena, marcos!.id, { db }))?.status).toBe(404);
		// Nor does marking everything read reach anyone else's.
		markAllRead(lena, { db });
		expect(unreadCount(marco, { db })).toBe(1);
	});
});

describe('replies and mentions', () => {
	const token = (who: Ctx) => `@M-${String(who.membership.seq).padStart(4, '0')}`;
	const kinds = (who: Ctx) => listNotifications(who, { db }).map((n) => n.kind);

	it('collapses three replies into one row that counts them', () => {
		const thread = threadWith(ana, [marco]);
		for (const body of ['One.', 'Two.', 'Three.']) {
			addMessage(lena, { discussionId: thread.id, body }, { db });
		}

		const replies = listNotifications(marco, { db }).filter((n) => n.kind === 'discussion.reply');
		expect(replies).toHaveLength(1);
		expect(replies[0]!.params).toEqual({ title: 'Exit and separation', count: 3 });
		// Ana opened the thread and hears of Marco's message and Lena's three, as one.
		expect(listNotifications(ana, { db })[0]!.params).toMatchObject({ count: 4 });
	});

	it('starts a new row after the last one was read', () => {
		const thread = threadWith(ana, [marco]);
		addMessage(lena, { discussionId: thread.id, body: 'One.' }, { db });
		markAllRead(marco, { db });
		addMessage(lena, { discussionId: thread.id, body: 'Two.' }, { db });

		const replies = listNotifications(marco, { db }).filter((n) => n.kind === 'discussion.reply');
		expect(replies).toHaveLength(2);
		expect(replies.filter((n) => n.readAt === null)[0]!.params).toMatchObject({ count: 1 });
	});

	it('tells nobody who has not written in the thread', () => {
		const thread = threadWith(ana, [marco]);
		addMessage(marco, { discussionId: thread.id, body: 'More.' }, { db });
		expect(kinds(lena)).toEqual([]);
	});

	it('tells a mentioned member of the mention, and not also of the reply', () => {
		const thread = threadWith(ana, [marco]);
		addMessage(
			lena,
			{ discussionId: thread.id, body: `What do you think, ${token(marco)}?` },
			{ db }
		);

		const theirs = listNotifications(marco, { db });
		expect(theirs.map((n) => n.kind)).toEqual(['discussion.mention']);
		expect(theirs[0]!.params).toEqual({
			title: 'Exit and separation',
			actor: lena.membership.id
		});
		expect(listNotificationItems(marco, { db })[0]!.actor).toBe(lena.user.name);
	});

	it('mentions nobody with a number that is not a member here, or with your own', () => {
		const [outsider] = seedCommunity('other-place', ['bea@example.org']) as [Ctx];
		const thread = threadWith(ana);
		// Same number as somebody here would be a coincidence; a number nobody here
		// holds is the case that matters.
		addMessage(ana, { discussionId: thread.id, body: `Ask @M-0099 and ${token(ana)}.` }, { db });
		expect(db.select().from(notification).all()).toHaveLength(0);
		expect(kinds(outsider)).toEqual([]);
	});

	it('names a mentioner who has since been erased as a former member', () => {
		const thread = threadWith(ana, [marco]);
		addMessage(lena, { discussionId: thread.id, body: `${token(marco)}, see this.` }, { db });
		erasePerson(db, { userId: lena.user.id, actorId: lena.user.id, now: NOW });

		const [item] = listNotificationItems(marco, { db });
		expect(item!.actor).toBe(`Former member (M-${String(lena.membership.seq).padStart(4, '0')})`);
		expect(mentionDirectory(marco, [`${token(lena)}`], { db }).labels[lena.membership.seq]).toBe(
			item!.actor
		);
	});

	it('writes a proposal as a proposal, not as a reply, and a mention in it as a mention', () => {
		const thread = threadWith(ana, [marco, lena]);
		for (const who of [ana, marco, lena]) markAllRead(who, { db });
		addProposal(
			ana,
			{ discussionId: thread.id, body: `Members may leave. ${token(lena)}` },
			{ db }
		);
		const unread = (who: Ctx) =>
			listNotifications(who, { db })
				.filter((n) => n.readAt === null)
				.map((n) => n.kind);
		expect(unread(marco)).toEqual(['proposal.posted']);
		expect(unread(lena)).toEqual(['discussion.mention']);
	});

	it('writes neither the proposal nor its notifications when telling fails', () => {
		const thread = threadWith(ana, [marco]);
		const posts = () => db.select().from(post).all().length;
		const before = { posts: posts(), rows: db.select().from(notification).all().length };
		// Any failure while telling the thread stands in for the rest.
		db.run(
			sql`CREATE TRIGGER refuse_notification BEFORE INSERT ON notification BEGIN SELECT RAISE(ABORT, 'refused'); END`
		);
		expect(() =>
			addProposal(ana, { discussionId: thread.id, body: 'Members may leave.' }, { db })
		).toThrow(/refused/);
		db.run(sql`DROP TRIGGER refuse_notification`);

		expect(posts()).toBe(before.posts);
		expect(db.select().from(notification).all()).toHaveLength(before.rows);
	});
});

describe('what a list shows, and what it no longer may', () => {
	function frozenDecision() {
		const thread = threadWith(ana);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		return freeze(
			ana,
			{
				discussionId: thread.id,
				idempotencyKey: 'k1',
				title: 'Spending authority',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);
	}

	it('names the decision while the member may see it', () => {
		frozenDecision();
		const [item] = listNotificationItems(marco, { db }).filter((n) => n.kind === 'decision.frozen');
		expect(item!.available).toBe(true);
		expect(item!.params).toMatchObject({ title: 'Spending authority' });
	});

	it('carries no title once the decision is restricted from them', () => {
		frozenDecision();
		db.update(decision).set({ visibility: 'restricted' }).run();

		// The row still exists and is still theirs to mark read; what it was about
		// is exactly what they may no longer be told.
		const [item] = listNotificationItems(marco, { db }).filter((n) => n.kind === 'decision.frozen');
		expect(item!.available).toBe(false);
		expect(item!.params).toBeNull();
		expect(item!.summary).toBeNull();
		expect(JSON.stringify(item)).not.toContain('Spending authority');
	});

	it('lets a suspended community mark read, because reading changes nothing agreed', () => {
		const thread = threadWith(ana, [marco]);
		addProposal(ana, { discussionId: thread.id, body: 'The rule.' }, { db });
		db.update(community)
			.set({ status: 'suspended' })
			.where(eq(community.id, marco.community.id))
			.run();
		const suspended = {
			...marco,
			community: { ...marco.community, status: 'suspended' as const }
		} satisfies Ctx;
		const [first] = listNotificationItems(suspended, { db });

		expect(openNotification(suspended, first!.id, { db })).not.toBeNull();
		const second = threadWith(ana, [marco]);
		db.update(community)
			.set({ status: 'active' })
			.where(eq(community.id, marco.community.id))
			.run();
		addProposal(ana, { discussionId: second.id, body: 'Another.' }, { db });
		expect(markAllRead(suspended, { db })).toBe(1);
		expect(unreadCount(marco, { db })).toBe(0);
	});
});

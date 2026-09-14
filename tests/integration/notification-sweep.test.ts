import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition } from '../../src/lib/server/db/schema/definitions.js';
import { consentRound, discussion } from '../../src/lib/server/db/schema/discussions.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import { job } from '../../src/lib/server/db/schema/jobs.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import {
	community,
	communityStandard,
	membership
} from '../../src/lib/server/db/schema/tenancy.js';
import { runClaimCheck } from '../../src/lib/server/jobs/claim-check.js';
import { runNotificationMail } from '../../src/lib/server/jobs/notification-mail.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import { runNotificationSweep } from '../../src/lib/server/jobs/notification-sweep.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import {
	addMessage,
	addProposal,
	openDiscussion
} from '../../src/lib/server/services/discussions.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The notifications nobody's act causes, and the claim check.
 * `openspec/changes/notifications-page`, UI spec §4.11. A fixed clock throughout.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const APP = 'https://compass.example.org';
const clause = getStandard('rcos-core', '0.1').countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let marco: Ctx;
let lena: Ctx;

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
	const seat = (email: string, role: 'steward' | 'member', isOwner = false): Ctx => {
		const person = makeUser(db, { email });
		return {
			user: person,
			community: home,
			membership: makeMembership(db, home.id, person.id, { role, isOwner }),
			now: () => NOW
		};
	};
	ana = seat('ana@example.org', 'steward', true);
	marco = seat('marco@example.org', 'member');
	lena = seat('lena@example.org', 'member');
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const sweep = (at = NOW) => runNotificationSweep(db, fixedClock(at));
const kindsFor = (who: Ctx, kind: string) =>
	db
		.select()
		.from(notification)
		.where(eq(notification.recipientMembershipId, who.membership.id))
		.all()
		.filter((row) => row.kind === kind);
const jobs = (kind: string) => db.select().from(job).where(eq(job.kind, kind)).all();

function thread(who: Ctx = ana) {
	return openDiscussion(
		who,
		{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: clause.key } },
		{ db }
	);
}

function roundClosing(closesAt: number | null) {
	const opened = thread();
	const proposal = addProposal(ana, { discussionId: opened.id, body: 'The rule.' }, { db });
	getVotingProvider().openRound(ana, { proposalPostId: proposal.id, closesAt }, { db });
	return { opened, proposal };
}

describe('a consent round closing', () => {
	it('reminds, once, the eligible who have not responded', () => {
		const { proposal } = roundClosing(NOW + 24 * HOUR);
		getVotingProvider().respond(marco, { proposalPostId: proposal.id, value: 'consent' }, { db });

		expect(sweep().closing).toBeGreaterThan(0);
		expect(kindsFor(lena, 'consent.closing')).toHaveLength(1);
		expect(kindsFor(marco, 'consent.closing')).toHaveLength(0);
		expect(kindsFor(lena, 'consent.closing')[0]!.params).toMatchObject({
			closesAt: NOW + 24 * HOUR
		});
		const mailed = jobs('notification-mail').length;
		expect(mailed).toBeGreaterThan(0);

		expect(sweep(NOW + HOUR).closing).toBe(0);
		expect(kindsFor(lena, 'consent.closing')).toHaveLength(1);
		expect(jobs('notification-mail')).toHaveLength(mailed);
	});

	it('emails the closing time in the recipient’s own time zone', async () => {
		roundClosing(NOW + 24 * HOUR);
		db.update(user).set({ timeZone: 'Asia/Tokyo' }).where(eq(user.id, lena.user.id)).run();
		sweep();

		const mail = memoryTransport();
		setMailTransportForTests(mail);
		const lenas = kindsFor(lena, 'consent.closing')[0]!;
		await runNotificationMail(db, fixedClock(NOW), { notificationId: lenas.id }, APP);
		resetMailTransportForTests();

		// 12:00 UTC the next day is 21:00 in Tokyo.
		expect(mail.sent[0]!.subject).toBe('A consent round closes soon in Valle Verde');
		expect(mail.sent[0]!.text).toMatch(/21:00/);
		expect(mail.sent[0]!.text).not.toContain('Exit and separation');
	});

	it('says nothing of a round with no closing time, or one closing later', () => {
		roundClosing(null);
		roundClosing(NOW + 72 * HOUR);
		expect(sweep().closing).toBe(0);
	});

	it('says nothing of a round already closed', () => {
		roundClosing(NOW + HOUR);
		db.update(consentRound).set({ status: 'closed' }).run();
		expect(sweep().closing).toBe(0);
	});
});

describe('a quiet thread', () => {
	const quietSince = (id: string, at: number) =>
		db
			.update(discussion)
			.set({ lastActivityAt: new Date(at) })
			.where(eq(discussion.id, id))
			.run();

	it('tells its opener once for each quiet spell', () => {
		const opened = thread();
		quietSince(opened.id, NOW - 15 * DAY);

		expect(sweep().quiet).toBe(1);
		expect(kindsFor(ana, 'discussion.quiet')).toHaveLength(1);
		expect(sweep(NOW + HOUR).quiet).toBe(0);

		// Somebody wrote, and then it went quiet again.
		addMessage(
			{ ...marco, now: () => NOW + DAY },
			{ discussionId: opened.id, body: 'Still here.' },
			{ db }
		);
		expect(sweep(NOW + 15 * DAY).quiet).toBe(1);
		expect(kindsFor(ana, 'discussion.quiet')).toHaveLength(2);
	});

	it('does not tell about a thread quiet for less, abandoned, or opened by someone who left', () => {
		quietSince(thread().id, NOW - 13 * DAY);
		const abandoned = thread();
		quietSince(abandoned.id, NOW - 20 * DAY);
		db.update(discussion).set({ status: 'abandoned' }).where(eq(discussion.id, abandoned.id)).run();
		const left = thread(lena);
		quietSince(left.id, NOW - 20 * DAY);
		db.update(membership)
			.set({ endedAt: new Date(NOW - DAY) })
			.where(eq(membership.id, lena.membership.id))
			.run();

		expect(sweep().quiet).toBe(0);
	});
});

describe('a definition due for review', () => {
	function adopted(author: Ctx) {
		const opened = thread();
		addProposal(author, { discussionId: opened.id, body: 'Members may leave.' }, { db });
		freeze(
			ana,
			{
				discussionId: opened.id,
				idempotencyKey: newId(),
				title: 'Exit and separation',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);
		const row = db.select().from(definition).all()[0]!;
		db.update(definition)
			.set({ reviewDueAt: new Date(NOW - DAY) })
			.where(eq(definition.id, row.id))
			.run();
		return row;
	}

	it('tells the adopted version’s author, once per date', () => {
		adopted(marco);
		expect(sweep().reviews).toBe(1);
		expect(kindsFor(marco, 'definition.review_due')).toHaveLength(1);
		expect(sweep(NOW + HOUR).reviews).toBe(0);
	});

	it('tells whoever created the definition when the author has left', () => {
		adopted(marco);
		db.update(membership)
			.set({ endedAt: new Date(NOW - DAY) })
			.where(eq(membership.id, marco.membership.id))
			.run();
		expect(sweep().reviews).toBe(1);
		expect(kindsFor(ana, 'definition.review_due')).toHaveLength(1);
	});

	it('says nothing before the date', () => {
		const row = adopted(marco);
		db.update(definition)
			.set({ reviewDueAt: new Date(NOW + DAY) })
			.where(eq(definition.id, row.id))
			.run();
		expect(sweep().reviews).toBe(0);
	});
});

describe('the claim check', () => {
	const check = () => runClaimCheck(db, fixedClock(NOW), { communityId: ana.community.id });
	const compliantBefore = (value: boolean | null) =>
		db
			.update(community)
			.set({ claimCompliant: value })
			.where(eq(community.id, ana.community.id))
			.run();

	it('records its first answer silently', () => {
		expect(check()).toBe('recorded');
		const stored = db.select().from(community).where(eq(community.id, ana.community.id)).get();
		expect(stored!.claimCompliant).toBe(false);
		expect(db.select().from(notification).all()).toHaveLength(0);
	});

	it('says nothing to a community that never complied', () => {
		compliantBefore(false);
		expect(check()).toBe('recorded');
		expect(db.select().from(notification).all()).toHaveLength(0);
	});

	it('tells the stewards, and only them, when a claim is withdrawn', () => {
		compliantBefore(true);
		expect(check()).toBe('withdrawn');
		expect(kindsFor(ana, 'claim.withdrawn')).toHaveLength(1);
		expect(kindsFor(marco, 'claim.withdrawn')).toHaveLength(0);
		expect(jobs('notification-mail')).toHaveLength(1);
		// And not again: the stored answer is now no.
		expect(check()).toBe('recorded');
	});

	it('is enqueued by a freeze', () => {
		compliantBefore(true);
		const opened = thread();
		addProposal(ana, { discussionId: opened.id, body: 'Members may leave.' }, { db });
		freeze(
			ana,
			{
				discussionId: opened.id,
				idempotencyKey: 'k1',
				title: 'Exit',
				type: 'strategic',
				mechanism: 'consent'
			},
			{ db }
		);
		expect(jobs('claim-check').map((row) => row.payload)).toEqual([
			{ communityId: ana.community.id }
		]);
		expect(check()).toBe('withdrawn');
	});

	it('is run by the sweep for every active community, without queueing one per community', () => {
		compliantBefore(true);
		expect(sweep().claims).toBe(1);
		expect(kindsFor(ana, 'claim.withdrawn')).toHaveLength(1);
		expect(jobs('claim-check')).toHaveLength(0);
	});
});

describe('a suspended community', () => {
	it('gets no sweep work at all', () => {
		roundClosing(NOW + HOUR);
		db.update(community)
			.set({ status: 'suspended' })
			.where(eq(community.id, ana.community.id))
			.run();

		expect(sweep()).toEqual({ closing: 0, quiet: 0, reviews: 0, claims: 0 });
		expect(jobs('claim-check')).toHaveLength(0);
		expect(runClaimCheck(db, fixedClock(NOW), { communityId: ana.community.id })).toBe('skipped');
	});
});

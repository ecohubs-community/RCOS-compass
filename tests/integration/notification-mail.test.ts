import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { job } from '../../src/lib/server/db/schema/jobs.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { mailFailure } from '../../src/lib/server/db/schema/operations.js';
import { community, membership } from '../../src/lib/server/db/schema/tenancy.js';
import {
	runNotificationMail,
	type NotificationMailPayload
} from '../../src/lib/server/jobs/notification-mail.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { erasePerson } from '../../src/lib/server/services/erasure.js';
import { endMembership, setMemberRole } from '../../src/lib/server/services/members.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The notifications that are also emails. `openspec/changes/notifications-page`,
 * UI spec §4.11, docs/04-security.md §4.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const APP = 'https://compass.example.org';

let db: Db;
let cleanup: () => void;
let mail: ReturnType<typeof memoryTransport>;
let ana: Ctx;
let marco: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	mail = memoryTransport();
	setMailTransportForTests(mail);

	const home = makeCommunity(db, { slug: 'valle-verde' });
	const steward = makeUser(db, { email: 'ana@example.org', name: 'Ana Restrepo' });
	const member = makeUser(db, { email: 'marco@example.org', name: 'Marco Ruiz' });
	const now = () => NOW;
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now
	};
	marco = {
		user: member,
		community: home,
		membership: makeMembership(db, home.id, member.id),
		now
	};
});

afterEach(() => {
	setDbForTests(null);
	resetMailTransportForTests();
	cleanup();
});

const mailJobs = () => db.select().from(job).where(eq(job.kind, 'notification-mail')).all();

/** Run every queued mail job, the way the worker would. */
async function deliver() {
	const outcomes = [];
	for (const row of mailJobs()) {
		outcomes.push(
			await runNotificationMail(db, fixedClock(NOW), row.payload as NotificationMailPayload, APP)
		);
	}
	return outcomes;
}

describe('a role change', () => {
	it('writes the row and one mail job, and tells only the member', async () => {
		setMemberRole(ana, marco.membership.id, 'steward');

		const rows = db.select().from(notification).all();
		expect(rows.map((row) => [row.kind, row.recipientMembershipId])).toEqual([
			['membership.role_changed', marco.membership.id]
		]);
		expect(mailJobs()).toHaveLength(1);

		expect(await deliver()).toEqual(['sent']);
		expect(mail.sent).toHaveLength(1);
		expect(mail.sent[0]!.to).toBe('marco@example.org');
		expect(mail.sent[0]!.subject).toBe('You are now a steward of Valle Verde');
		expect(mail.sent[0]!.url).toBe(`${APP}/c/valle-verde`);
		expect(mail.sent[0]!.text).toContain(`${APP}/c/valle-verde/notifications/settings`);
	});

	it('tells nobody when the role saved is the one the member already has', () => {
		setMemberRole(ana, marco.membership.id, 'member');
		expect(db.select().from(notification).all()).toHaveLength(0);
		expect(mailJobs()).toHaveLength(0);
	});

	it('is written in the community’s language', async () => {
		db.update(community).set({ locale: 'de' }).where(eq(community.id, ana.community.id)).run();
		setMemberRole(ana, marco.membership.id, 'steward');
		await deliver();
		expect(mail.sent[0]!.subject).toBe('Du bist jetzt Steward von Valle Verde');
	});

	it('keeps the row and sends nothing to a member with email off', async () => {
		db.update(membership)
			.set({ emailEnabled: false })
			.where(eq(membership.id, marco.membership.id))
			.run();
		setMemberRole(ana, marco.membership.id, 'steward');

		expect(db.select().from(notification).all()).toHaveLength(1);
		expect(await deliver()).toEqual(['skipped']);
		expect(mail.sent).toHaveLength(0);
	});

	it('stays changed when the send fails, and the failure is recorded', async () => {
		setMailTransportForTests({
			id: 'down',
			send: () => Promise.reject(new Error('connection refused'))
		});
		setMemberRole(ana, marco.membership.id, 'steward');

		await expect(deliver()).rejects.toThrow('connection refused');
		const seat = db.select().from(membership).where(eq(membership.id, marco.membership.id)).get();
		expect(seat!.role).toBe('steward');
		expect(
			db
				.select()
				.from(mailFailure)
				.all()
				.map((row) => row.kind)
		).toEqual(['notification.membership.role_changed']);
	});

	it('sends nothing while the community is suspended', async () => {
		setMemberRole(ana, marco.membership.id, 'steward');
		db.update(community)
			.set({ status: 'suspended' })
			.where(eq(community.id, ana.community.id))
			.run();
		expect(await deliver()).toEqual(['skipped']);
		expect(mail.sent).toHaveLength(0);
	});
});

describe('a removal', () => {
	it('writes no row and one mail job, saying nothing of who or why', async () => {
		endMembership(ana, marco.membership.id);

		expect(db.select().from(notification).all()).toHaveLength(0);
		expect(mailJobs()).toHaveLength(1);
		expect(await deliver()).toEqual(['sent']);
		expect(mail.sent[0]!.subject).toBe('Your membership of Valle Verde has ended');
		expect(mail.sent[0]!.text).not.toContain('Ana');
		// Nothing there is theirs to change any more.
		expect(mail.sent[0]!.text).not.toContain('/settings');
	});

	it('is sent once, and keeps its date, when the membership is ended twice', () => {
		endMembership(ana, marco.membership.id);
		const ended = db.select().from(membership).where(eq(membership.id, marco.membership.id)).get()!
			.endedAt;
		endMembership({ ...ana, now: () => NOW + 60_000 }, marco.membership.id);

		expect(mailJobs()).toHaveLength(1);
		expect(
			db.select().from(membership).where(eq(membership.id, marco.membership.id)).get()!.endedAt
		).toEqual(ended);
	});

	it('is not sent when an erasure ends the membership', async () => {
		erasePerson(db, { userId: marco.user.id, actorId: marco.user.id, now: NOW });
		expect(mailJobs()).toHaveLength(0);
	});
});

describe('what an email may say', () => {
	it('names the community and nothing from inside it', async () => {
		const thread = openDiscussion(
			ana,
			{ title: 'A title nobody outside should read', about: { kind: 'open_question' } },
			{ db }
		);
		const proposal = addProposal(
			ana,
			{ discussionId: thread.id, body: 'A proposal nobody outside should read.' },
			{ db }
		);
		getVotingProvider().openRound(ana, { proposalPostId: proposal.id, closesAt: null }, { db });

		expect(await deliver()).toEqual(['sent']);
		const [sent] = mail.sent;
		expect(sent!.subject).toBe('A consent round is open in Valle Verde');
		expect(sent!.url).toBe(`${APP}/c/valle-verde/discussions/${thread.id}`);
		for (const secret of ['A title nobody outside should read', 'A proposal nobody outside']) {
			expect(sent!.subject).not.toContain(secret);
			expect(sent!.text).not.toContain(secret);
		}
	});
});

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { membership } from '../../src/lib/server/db/schema/tenancy.js';
import { sendDigests } from '../../src/lib/server/jobs/digest.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import {
	addMessage,
	addProposal,
	openDiscussion
} from '../../src/lib/server/services/discussions.js';
import {
	notificationPreferences,
	setNotificationPreferences
} from '../../src/lib/server/services/notification-preferences.js';
import { listNotifications } from '../../src/lib/server/services/notifications.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Email preferences and the per-member digest. `openspec/changes/notifications-page`,
 * UI spec §4.11, docs/04-security.md §4.
 *
 * Monday 7 September 2026. In September Lisbon is UTC+1 and Tokyo UTC+9, so
 * 07:00 on Monday is 06:00 UTC in Lisbon and 22:00 UTC on Sunday in Tokyo.
 */
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const MONDAY_UTC = Date.UTC(2026, 8, 7);
const APP = 'https://compass.example.org';

let db: Db;
let cleanup: () => void;
let mail: ReturnType<typeof memoryTransport>;
let ana: Ctx;
let marco: Ctx;

function seat(communityId: string, email: string, zone: string | null, role: 'steward' | 'member') {
	const person = makeUser(db, { email });
	db.update(user).set({ timeZone: zone }).where(eq(user.id, person.id)).run();
	return {
		person: { ...person, timeZone: zone },
		seat: makeMembership(db, communityId, person.id, { role, isOwner: role === 'steward' })
	};
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	mail = memoryTransport();
	setMailTransportForTests(mail);

	const home = makeCommunity(db, { slug: 'valle-verde' });
	const a = seat(home.id, 'ana@example.org', 'Asia/Tokyo', 'steward');
	const m = seat(home.id, 'marco@example.org', 'Europe/Lisbon', 'member');
	// Activity in the week before, written as it would be.
	const before = () => MONDAY_UTC - 2 * DAY;
	ana = { user: a.person, community: home, membership: a.seat, now: before };
	marco = { user: m.person, community: home, membership: m.seat, now: before };

	const thread = openDiscussion(
		ana,
		{ title: 'A title nobody outside should read', about: { kind: 'open_question' } },
		{ db }
	);
	addMessage(
		marco,
		{ discussionId: thread.id, body: 'A reply nobody outside should read.' },
		{ db }
	);
	addProposal(
		ana,
		{ discussionId: thread.id, body: 'A proposal nobody outside should read.' },
		{ db }
	);
});

afterEach(() => {
	setDbForTests(null);
	resetMailTransportForTests();
	cleanup();
});

const run = (at: number) => sendDigests(db, fixedClock(at), APP);
const recipients = () => mail.sent.map((message) => message.to);

describe('the digest arrives on the member’s own morning', () => {
	it('sends on the chosen day after 07:00 where they are, and once', async () => {
		await run(MONDAY_UTC + 5.5 * HOUR); // 06:30 in Lisbon
		expect(recipients()).not.toContain('marco@example.org');

		await run(MONDAY_UTC + 6.5 * HOUR); // 07:30 in Lisbon
		expect(recipients().filter((to) => to === 'marco@example.org')).toHaveLength(1);

		await run(MONDAY_UTC + 7.5 * HOUR);
		await run(MONDAY_UTC + DAY + 6.5 * HOUR);
		expect(recipients().filter((to) => to === 'marco@example.org')).toHaveLength(1);

		// And again the next week.
		await run(MONDAY_UTC + 7 * DAY + 6.5 * HOUR);
		expect(recipients().filter((to) => to === 'marco@example.org')).toHaveLength(2);
	});

	it('reaches two members in two time zones at their own mornings', async () => {
		await run(MONDAY_UTC - 1.5 * HOUR); // Sunday 22:30 UTC: 07:30 Monday in Tokyo
		expect(recipients()).toEqual(['ana@example.org']);

		await run(MONDAY_UTC + 6.5 * HOUR);
		expect(recipients()).toEqual(['ana@example.org', 'marco@example.org']);
	});

	it('follows the day a member chose', async () => {
		setNotificationPreferences(marco, marco.membership.id, { emailEnabled: true, digestDay: 3 });
		await run(MONDAY_UTC + 6.5 * HOUR);
		expect(recipients()).not.toContain('marco@example.org');
		await run(MONDAY_UTC + 2 * DAY + 6.5 * HOUR);
		expect(recipients()).toContain('marco@example.org');
	});
});

describe('what a digest says', () => {
	it('has counts and what is waiting, and no content', async () => {
		await run(MONDAY_UTC + 6.5 * HOUR);
		const message = mail.sent.find((sent) => sent.to === 'marco@example.org')!;

		expect(message.text).toMatch(/1 discussion had activity/);
		expect(message.text).toMatch(/1 new proposal/);
		expect(message.text).toContain(`${APP}/c/valle-verde/notifications/settings`);
		for (const secret of [
			'A title nobody outside should read',
			'A reply nobody outside should read.',
			'A proposal nobody outside should read.'
		]) {
			expect(message.text).not.toContain(secret);
			expect(message.subject).not.toContain(secret);
		}
	});

	it('sends nothing for a quiet week, and does not check that member again that day', async () => {
		const quiet = MONDAY_UTC + 14 * DAY + 6.5 * HOUR;
		db.update(membership)
			.set({ lastDigestAt: new Date(MONDAY_UTC + 7 * DAY) })
			.run();
		// Everything read, and nothing new in the fortnight since.
		db.update(notification)
			.set({ readAt: new Date(MONDAY_UTC) })
			.run();

		const first = await run(quiet);
		expect(first.sent).toBe(0);
		expect(first.quiet).toBeGreaterThan(0);
		expect((await run(quiet + HOUR)).due).toBe(0);
	});
});

describe('email preferences', () => {
	it('stop the digest when email is off, but not the notifications', async () => {
		setNotificationPreferences(marco, marco.membership.id, { emailEnabled: false, digestDay: 1 });
		await run(MONDAY_UTC + 6.5 * HOUR);
		expect(recipients()).not.toContain('marco@example.org');
		expect(listNotifications(marco, { db }).length).toBeGreaterThan(0);
	});

	it('are a member’s own: a steward changing another member’s is not found', () => {
		const refused = catchRefusal(() =>
			setNotificationPreferences(ana, marco.membership.id, { emailEnabled: false, digestDay: 1 })
		);
		expect(refused?.status).toBe(404);
		expect(notificationPreferences(marco, marco.membership.id).emailEnabled).toBe(true);
	});

	it('belong to one community, and leave the same person’s other one alone', () => {
		const elsewhere = makeCommunity(db, { slug: 'other-place' });
		const theirs = makeMembership(db, elsewhere.id, marco.user.id);
		const there: Ctx = { ...marco, community: elsewhere, membership: theirs };

		setNotificationPreferences(marco, marco.membership.id, { emailEnabled: false, digestDay: 5 });
		expect(notificationPreferences(there, theirs.id)).toEqual({ emailEnabled: true, digestDay: 1 });
		// And the other community's seat cannot be reached from here.
		expect(catchRefusal(() => notificationPreferences(marco, theirs.id))?.status).toBe(404);
	});

	it('refuse a day that is not a day of the week', () => {
		expect(
			catchRefusal(() =>
				setNotificationPreferences(marco, marco.membership.id, { emailEnabled: true, digestDay: 7 })
			)?.status
		).toBe(400);
	});
});

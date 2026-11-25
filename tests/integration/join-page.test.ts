import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { resetAuthForTests } from '../../src/lib/server/auth/auth.js';
import { systemClock } from '../../src/lib/server/clock.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import { joinRequest, membership } from '../../src/lib/server/db/schema/tenancy.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import { turnOffJoinLink, turnOnJoinLink } from '../../src/lib/server/services/join-link.js';
import { hasPassword, setFirstPassword } from '../../src/lib/server/auth/join-account.js';
import { actions } from '../../src/routes/(account)/join/[token]/+page.server.js';
import { actions as invitationActions } from '../../src/routes/(account)/invitations/[token]/+page.server.js';
import { inviteMember } from '../../src/lib/server/services/invitations.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The join link's form, through the route's own action.
 * `openspec/changes/pilot-blockers` D4, the `join-link` and `authentication`
 * deltas.
 *
 * The one rule worth a test of its own: the page answers the same way whatever
 * is true of the address, so it cannot be used to find out who has an account.
 * What differs is only what lands in that address's inbox.
 */
let db: Db;
let cleanup: () => void;
let mail: ReturnType<typeof memoryTransport>;
let steward: Ctx;
let token: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	resetAuthForTests();
	mail = memoryTransport();
	setMailTransportForTests(mail);

	const home = makeCommunity(db, { slug: 'valle-verde', name: 'Valle Verde' });
	const ana = makeUser(db, { email: 'ana@example.org' });
	const seat = makeMembership(db, home.id, ana.id, { role: 'steward', isOwner: true });
	steward = { user: ana, community: home, membership: seat, now: systemClock.now };
	token = turnOnJoinLink(steward, { db }).token;
});

afterEach(() => {
	setDbForTests(null);
	resetAuthForTests();
	resetMailTransportForTests();
	cleanup();
});

const quiet = { warn() {}, error() {}, info() {} };

async function submit(fields: Record<string, string>, at = token) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const url = new URL(`http://localhost/join/${at}?/create`);
	const event = {
		params: { token: at },
		url,
		request: new Request(url, { method: 'POST', body }),
		locals: { user: null, log: quiet },
		getClientAddress: () => '127.0.0.1',
		cookies: { get: () => undefined, set() {}, delete() {} }
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (actions.create as any)(event);
}

const asking = (email: string) => ({ name: 'Marco', email });

const accountOf = (email: string) => db.select().from(user).where(eq(user.email, email)).get();

describe('the join form', () => {
	it('makes an unverified account with no password and a request, and mails a confirmation', async () => {
		const answer = await submit(asking('marco@example.org'));
		expect(answer).toEqual({ checkInbox: 'marco@example.org', communityName: 'Valle Verde' });

		const marco = accountOf('marco@example.org')!;
		expect(marco.emailVerified).toBe(false);
		// Whoever typed the address chose nothing the owner of it would inherit.
		expect(hasPassword(db, marco.id)).toBe(false);
		expect(
			db.select().from(joinRequest).where(eq(joinRequest.userId, marco.id)).all()
		).toHaveLength(1);
		expect(db.select().from(membership).where(eq(membership.userId, marco.id)).all()).toEqual([]);
		expect(mail.sent.map((m) => m.subject)).toEqual(['Confirm your email address']);
		expect(new URL(mail.sent[0]!.url!).searchParams.get('callbackURL')).toBe('/join');
	});

	it('answers the same for an address with a verified account, and only mails a sign-in link', async () => {
		makeUser(db, { email: 'known@example.org', verified: true });

		const answer = await submit(asking('known@example.org'));
		expect(answer).toEqual({ checkInbox: 'known@example.org', communityName: 'Valle Verde' });

		expect(db.select().from(user).where(eq(user.email, 'known@example.org')).all()).toHaveLength(1);
		expect(db.select().from(joinRequest).all()).toEqual([]);
		expect(mail.sent.map((m) => m.subject)).toEqual(['Your sign-in link']);
	});

	it('answers the same for an account never verified, sends a fresh confirmation, and keeps one request', async () => {
		const stalled = makeUser(db, { email: 'stalled@example.org', verified: false });

		expect(await submit(asking('stalled@example.org'))).toEqual({
			checkInbox: 'stalled@example.org',
			communityName: 'Valle Verde'
		});
		await submit(asking('stalled@example.org'));

		expect(
			db.select().from(joinRequest).where(eq(joinRequest.userId, stalled.id)).all()
		).toHaveLength(1);
		expect(mail.sent.every((m) => m.subject === 'Confirm your email address')).toBe(true);
		expect(mail.sent.length).toBeGreaterThan(0);
	});

	it('makes no account through a link that was turned off', async () => {
		turnOffJoinLink(steward, { db });
		const answer = await submit(asking('late@example.org'));

		expect(answer.status).toBe(410);
		expect(accountOf('late@example.org')).toBeUndefined();
		expect(mail.sent).toEqual([]);
	});

	it('ignores a password posted to it anyway', async () => {
		await submit({ ...asking('sneaky@example.org'), password: 'chosen-by-somebody-else' });
		expect(hasPassword(db, accountOf('sneaky@example.org')!.id)).toBe(false);
	});
});

describe('the first password', () => {
	it('is set once, by the account it belongs to, and never replaced here', async () => {
		await submit(asking('marco@example.org'));
		const marco = accountOf('marco@example.org')!;

		expect(await setFirstPassword(db, marco.id, 'a-long-enough-password')).toBe('set');
		expect(hasPassword(db, marco.id)).toBe(true);
		expect(await setFirstPassword(db, marco.id, 'another-long-password')).toBe('already_set');
	});
});

describe('an email invitation to an address that used a join link', () => {
	it('finishes the account: verified, given the password from the invitation, and a member', async () => {
		await submit(asking('marco@example.org'));
		const marco = accountOf('marco@example.org')!;
		expect(marco.emailVerified).toBe(false);

		const { token: invitationToken } = inviteMember(
			steward,
			{ email: 'marco@example.org' },
			{ db }
		);
		const body = new FormData();
		body.set('name', 'Marco');
		body.set('password', 'a-long-enough-password');
		const url = new URL(`http://localhost/invitations/${invitationToken}?/create`);
		const event = {
			params: { token: invitationToken },
			url,
			request: new Request(url, { method: 'POST', body }),
			locals: { user: null, log: quiet },
			getClientAddress: () => '127.0.0.1',
			cookies: { get: () => undefined, set() {}, delete() {} }
		};
		// The way in ends in a redirect to the community, thrown.
		const outcome = await (invitationActions.create as unknown as (e: unknown) => Promise<unknown>)(
			event
		).catch((thrown: unknown) => thrown);
		expect(outcome).toMatchObject({ status: 303, location: '/c/valle-verde' });

		const after = accountOf('marco@example.org')!;
		expect(after.emailVerified).toBe(true);
		expect(hasPassword(db, after.id)).toBe(true);
		expect(db.select().from(membership).where(eq(membership.userId, after.id)).all()).toHaveLength(
			1
		);
		// Their join-link request to this same community is answered by joining,
		// so it is gone, and no steward was told someone is asking.
		expect(db.select().from(joinRequest).all()).toEqual([]);
		expect(db.select().from(notification).all()).toEqual([]);
	});
});

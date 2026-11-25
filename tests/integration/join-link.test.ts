import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { createAuth, resetAuthForTests } from '../../src/lib/server/auth/auth.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import {
	auditEvent,
	community,
	communityJoinLink,
	invitation,
	joinRequest,
	membership
} from '../../src/lib/server/db/schema/tenancy.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import { joinLocale } from '../../src/lib/server/http/resolve-tenant.js';
import { erasePerson } from '../../src/lib/server/services/erasure.js';
import { inviteMember } from '../../src/lib/server/services/invitations.js';
import { notificationTarget } from '../../src/lib/server/services/notification-subjects.js';
import {
	inspectJoinLink,
	joinLinkOf,
	replaceJoinLink,
	turnOffJoinLink,
	turnOnJoinLink
} from '../../src/lib/server/services/join-link.js';
import {
	JOIN_REQUESTS_PER_COMMUNITY,
	UNVERIFIED_REQUEST_TTL_MS,
	admitJoinRequest,
	declineJoinRequest,
	dropStaleJoinRequests,
	eraseAbandonedJoinAccounts,
	listJoinRequests,
	noteVerifiedJoinRequests,
	openRequestsOf,
	requestToJoin
} from '../../src/lib/server/services/join-requests.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The join link and the requests it makes. `openspec/changes/pilot-blockers`,
 * the `join-link` spec, and the notifications and erasure deltas.
 */
const START = Date.UTC(2026, 10, 25, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;
let steward: Ctx;
let member: Ctx;
let secondSteward: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	clock = fixedClock(START);

	const home = makeCommunity(db, { slug: 'valle-verde', name: 'Valle Verde' });
	const ana = makeUser(db, { email: 'ana@example.org', name: 'Ana' });
	const lena = makeUser(db, { email: 'lena@example.org', name: 'Lena' });
	const tomas = makeUser(db, { email: 'tomas@example.org', name: 'Tomás' });
	const anaSeat = makeMembership(db, home.id, ana.id, { role: 'steward', isOwner: true });
	const lenaSeat = makeMembership(db, home.id, lena.id, { role: 'member' });
	const tomasSeat = makeMembership(db, home.id, tomas.id, { role: 'steward' });
	steward = { user: ana, community: home, membership: anaSeat, now: clock.now };
	member = { user: lena, community: home, membership: lenaSeat, now: clock.now };
	secondSteward = { user: tomas, community: home, membership: tomasSeat, now: clock.now };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const linkOn = () => turnOnJoinLink(steward, { db }).token;
const newcomer = (email = 'marco@example.org', verified = false) =>
	makeUser(db, { email, verified, name: 'Marco' });
const requests = () => db.select().from(joinRequest).all();
const notesFor = (seatId: string) =>
	db.select().from(notification).where(eq(notification.recipientMembershipId, seatId)).all();

describe('the link itself', () => {
	it('is off until a steward turns it on, and the same link is shown again later', () => {
		expect(joinLinkOf(steward, { db })).toBeNull();
		const token = linkOn();
		expect(joinLinkOf(steward, { db })?.token).toBe(token);
		expect(turnOnJoinLink(steward, { db }).token).toBe(token);
		expect(inspectJoinLink(db, token)).toMatchObject({
			kind: 'open',
			communitySlug: 'valle-verde'
		});
	});

	it('never stores the raw token', () => {
		const token = linkOn();
		expect(JSON.stringify(db.select().from(communityJoinLink).all())).not.toContain(token);
	});

	it('stops the old link at once when replaced', () => {
		const old = linkOn();
		const fresh = replaceJoinLink(steward, { db }).token;
		expect(fresh).not.toBe(old);
		expect(inspectJoinLink(db, old).kind).toBe('dead');
		expect(inspectJoinLink(db, fresh).kind).toBe('open');
	});

	it('drops unproven requests when replaced, and keeps a proven one', () => {
		const token = linkOn();
		requestToJoin(db, clock, { token, userId: newcomer('a@example.org').id });
		requestToJoin(db, clock, { token, userId: newcomer('b@example.org').id });
		const proven = newcomer('c@example.org', true);
		requestToJoin(db, clock, { token, userId: proven.id });

		replaceJoinLink(steward, { db });
		expect(requests().map((r) => r.userId)).toEqual([proven.id]);
	});

	it('stops working, and drops unproven requests, when turned off', () => {
		const token = linkOn();
		requestToJoin(db, clock, { token, userId: newcomer().id });
		turnOffJoinLink(steward, { db });

		expect(inspectJoinLink(db, token).kind).toBe('dead');
		expect(joinLinkOf(steward, { db })).toBeNull();
		expect(requests()).toHaveLength(0);
		expect(requestToJoin(db, clock, { token, userId: newcomer('z@example.org').id }).kind).toBe(
			'dead'
		);
	});

	it.each(['suspended', 'deleted'] as const)('reads as dead in a %s community', (status) => {
		const token = linkOn();
		db.update(community).set({ status }).where(eq(community.id, steward.community.id)).run();
		expect(inspectJoinLink(db, token).kind).toBe('dead');
	});

	it('is not a member’s to read or change', () => {
		linkOn();
		for (const act of [joinLinkOf, turnOnJoinLink, replaceJoinLink, turnOffJoinLink]) {
			expect(catchRefusal(() => act(member, { db }))?.status).toBe(403);
		}
	});

	it('is audited each time it changes', () => {
		linkOn();
		replaceJoinLink(steward, { db });
		turnOffJoinLink(steward, { db });
		const actions = db
			.select({ action: auditEvent.action })
			.from(auditEvent)
			.all()
			.map((row) => row.action)
			.sort();
		expect(actions).toEqual([
			'member.join_link_off',
			'member.join_link_on',
			'member.join_link_replaced'
		]);
	});
});

describe('asking to join', () => {
	it('writes a request and nothing more for an unproven address', () => {
		const token = linkOn();
		const marco = newcomer();

		expect(requestToJoin(db, clock, { token, userId: marco.id })).toEqual({
			kind: 'requested',
			communityName: 'Valle Verde',
			told: false
		});
		expect(requests()).toHaveLength(1);
		expect(db.select().from(membership).where(eq(membership.userId, marco.id)).all()).toEqual([]);
		expect(db.select().from(notification).all()).toEqual([]);
		expect(listJoinRequests(steward, { db })).toEqual([]);
	});

	it('tells each current steward once when the address is proven, and nobody else', () => {
		const token = linkOn();
		const marco = newcomer();
		requestToJoin(db, clock, { token, userId: marco.id });

		db.update(user).set({ emailVerified: true }).where(eq(user.id, marco.id)).run();
		expect(noteVerifiedJoinRequests(db, clock, marco.id)).toBe(1);
		expect(noteVerifiedJoinRequests(db, clock, marco.id)).toBe(0);

		expect(notesFor(steward.membership.id)).toHaveLength(1);
		expect(notesFor(secondSteward.membership.id)).toHaveLength(1);
		expect(notesFor(member.membership.id)).toHaveLength(0);

		const [note] = notesFor(steward.membership.id);
		expect(note!.kind).toBe('membership.join_requested');
		expect(note!.subjectType).toBe('members');
		// Neither the name nor the address travels with it.
		expect(JSON.stringify(note)).not.toContain('Marco');
		expect(JSON.stringify(note)).not.toContain('marco@example.org');

		expect(listJoinRequests(steward, { db }).map((r) => r.email)).toEqual(['marco@example.org']);
	});

	it('leads a steward to the Members page, and reads as gone to someone who is not one', () => {
		requestToJoin(db, clock, { token: linkOn(), userId: newcomer('p@example.org', true).id });
		const [note] = notesFor(steward.membership.id);

		expect(notificationTarget(db, steward, note!.subjectType, note!.subjectId)).toEqual({
			type: 'members'
		});
		// The same subject, read by someone without `member.invite`.
		expect(notificationTarget(db, member, note!.subjectType, note!.subjectId)).toBeNull();
	});

	it('does not tell a steward whose membership has ended', () => {
		db.update(membership)
			.set({ endedAt: new Date(START) })
			.where(eq(membership.id, secondSteward.membership.id))
			.run();
		requestToJoin(db, clock, { token: linkOn(), userId: newcomer('p@example.org', true).id });
		expect(notesFor(secondSteward.membership.id)).toHaveLength(0);
		expect(notesFor(steward.membership.id)).toHaveLength(1);
	});

	it('tells the stewards at once when a proven account asks', () => {
		expect(
			requestToJoin(db, clock, { token: linkOn(), userId: newcomer('p@example.org', true).id })
		).toMatchObject({ kind: 'requested', told: true });
		expect(notesFor(steward.membership.id)).toHaveLength(1);
	});

	it('takes a member straight to the community, and writes nothing', () => {
		expect(requestToJoin(db, clock, { token: linkOn(), userId: member.user.id })).toEqual({
			kind: 'joined',
			communitySlug: 'valle-verde'
		});
		expect(requests()).toHaveLength(0);
	});

	it('keeps one request for someone who asks twice', () => {
		const token = linkOn();
		const marco = newcomer();
		requestToJoin(db, clock, { token, userId: marco.id });
		expect(requestToJoin(db, clock, { token, userId: marco.id }).kind).toBe('waiting');
		expect(requests()).toHaveLength(1);
		expect(openRequestsOf(db, marco.id)).toEqual([{ communityName: 'Valle Verde' }]);
	});

	it(`holds at most ${JOIN_REQUESTS_PER_COMMUNITY} open requests`, () => {
		const token = linkOn();
		for (let i = 0; i < JOIN_REQUESTS_PER_COMMUNITY; i += 1) {
			requestToJoin(db, clock, { token, userId: newcomer(`n${i}@example.org`).id });
		}
		expect(requestToJoin(db, clock, { token, userId: newcomer('late@example.org').id }).kind).toBe(
			'full'
		);
		expect(requests()).toHaveLength(JOIN_REQUESTS_PER_COMMUNITY);
	});

	it('leaves out of the list someone who became a member another way meanwhile', () => {
		const marco = newcomer('m@example.org', true);
		requestToJoin(db, clock, { token: linkOn(), userId: marco.id });
		makeMembership(db, steward.community.id, marco.id);
		expect(listJoinRequests(steward, { db })).toEqual([]);
	});

	it('is a steward’s list, not a member’s', () => {
		expect(catchRefusal(() => listJoinRequests(member, { db }))?.status).toBe(403);
	});
});

describe('letting someone in', () => {
	const provenRequest = () => {
		const marco = newcomer('m@example.org', true);
		requestToJoin(db, clock, { token: linkOn(), userId: marco.id });
		return { marco, id: requests()[0]!.id };
	};

	it('makes them a member with the next number, removes the request, and tells them', () => {
		const { marco, id } = provenRequest();
		expect(admitJoinRequest(steward, id, { db })).toEqual({ kind: 'admitted', name: 'Marco' });

		const seat = db.select().from(membership).where(eq(membership.userId, marco.id)).get()!;
		expect(seat.role).toBe('member');
		expect(seat.isOwner).toBe(false);
		expect(seat.seq).toBe(4);
		expect(requests()).toHaveLength(0);

		const told = notesFor(seat.id);
		expect(told.map((n) => n.kind)).toEqual(['membership.join_approved']);

		const joined = db
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'member.joined'))
			.get()!;
		expect(joined.meta).toMatchObject({ via: 'join_link' });
	});

	it('creates nothing for someone who is already a member', () => {
		const { marco, id } = provenRequest();
		makeMembership(db, steward.community.id, marco.id);
		expect(admitJoinRequest(steward, id, { db }).kind).toBe('already_member');
		expect(db.select().from(membership).where(eq(membership.userId, marco.id)).all()).toHaveLength(
			1
		);
		expect(requests()).toHaveLength(0);
	});

	it('answers a second decision with 404, and makes no second membership', () => {
		const { marco, id } = provenRequest();
		admitJoinRequest(steward, id, { db });
		expect(catchRefusal(() => admitJoinRequest(secondSteward, id, { db }))?.status).toBe(404);
		expect(catchRefusal(() => declineJoinRequest(secondSteward, id, { db }))?.status).toBe(404);
		expect(db.select().from(membership).where(eq(membership.userId, marco.id)).all()).toHaveLength(
			1
		);
	});

	it('cannot let in an address nobody has proven', () => {
		requestToJoin(db, clock, { token: linkOn(), userId: newcomer().id });
		const id = requests()[0]!.id;
		expect(catchRefusal(() => admitJoinRequest(steward, id, { db }))?.status).toBe(404);
	});

	it('is not a member’s decision', () => {
		const { id } = provenRequest();
		expect(catchRefusal(() => admitJoinRequest(member, id, { db }))?.status).toBe(403);
		expect(catchRefusal(() => declineJoinRequest(member, id, { db }))?.status).toBe(403);
		expect(requests()).toHaveLength(1);
	});
});

describe('declining', () => {
	it('erases an account that never belonged anywhere, and returns its address for the mail', () => {
		const marco = newcomer('m@example.org', true);
		requestToJoin(db, clock, { token: linkOn(), userId: marco.id });

		expect(declineJoinRequest(steward, requests()[0]!.id, { db })).toEqual({
			email: 'm@example.org',
			erased: true
		});
		expect(requests()).toHaveLength(0);
		expect(db.select().from(user).where(eq(user.id, marco.id)).get()!.erasedAt).not.toBeNull();
	});

	it('keeps the account of someone who belongs to another community', () => {
		const marco = newcomer('m@example.org', true);
		makeMembership(db, makeCommunity(db).id, marco.id);
		requestToJoin(db, clock, { token: linkOn(), userId: marco.id });

		expect(declineJoinRequest(steward, requests()[0]!.id, { db }).erased).toBe(false);
		expect(db.select().from(user).where(eq(user.id, marco.id)).get()!.erasedAt).toBeNull();
	});

	it('keeps the account of someone another community has invited, and their invitation', () => {
		const marco = newcomer('m@example.org', true);
		const elsewhere = makeCommunity(db, { slug: 'elsewhere' });
		const host = makeUser(db, { email: 'host@example.org' });
		const hostSeat = makeMembership(db, elsewhere.id, host.id, { role: 'steward', isOwner: true });
		const hostCtx = { user: host, community: elsewhere, membership: hostSeat, now: clock.now };
		const { invitation: pending } = inviteMember(hostCtx, { email: 'm@example.org' }, { db });
		requestToJoin(db, clock, { token: linkOn(), userId: marco.id });

		expect(declineJoinRequest(steward, requests()[0]!.id, { db }).erased).toBe(false);
		const still = db.select().from(invitation).where(eq(invitation.id, pending.id)).get()!;
		expect(still.revokedAt).toBeNull();
	});

	it('keeps a platform admin’s account', () => {
		vi.stubEnv('ADMIN_EMAILS', 'admin@example.org');
		resetConfigForTests();
		try {
			const admin = newcomer('admin@example.org', true);
			requestToJoin(db, clock, { token: linkOn(), userId: admin.id });
			expect(declineJoinRequest(steward, requests()[0]!.id, { db }).erased).toBe(false);
		} finally {
			vi.unstubAllEnvs();
			resetConfigForTests();
		}
	});
});

describe('housekeeping', () => {
	it('drops unproven requests older than a week, and keeps proven and recent ones', () => {
		const token = linkOn();
		requestToJoin(db, clock, { token, userId: newcomer('old@example.org').id });
		requestToJoin(db, clock, { token, userId: newcomer('proven@example.org', true).id });
		clock.advance(UNVERIFIED_REQUEST_TTL_MS + 1);
		requestToJoin(db, clock, { token, userId: newcomer('new@example.org').id });

		expect(dropStaleJoinRequests(db, steward.community.id, clock.now())).toBe(1);
		expect(dropStaleJoinRequests(db, steward.community.id, clock.now())).toBe(0);
		expect(requests()).toHaveLength(2);
	});

	it('erases, after a week, an account nobody confirmed and nothing else holds', () => {
		const token = linkOn();
		const ghost = newcomer('ghost@example.org');
		const invited = newcomer('invited@example.org');
		requestToJoin(db, clock, { token, userId: ghost.id });
		inviteMember(steward, { email: 'invited@example.org' }, { db });
		// The link is replaced, which drops the request but not the account.
		replaceJoinLink(steward, { db });

		// The factory stamps accounts in September, well over a week before now.
		// One made today is left alone.
		const fresh = newcomer('fresh@example.org');
		db.update(user)
			.set({ createdAt: new Date(START) })
			.where(eq(user.id, fresh.id))
			.run();

		expect(eraseAbandonedJoinAccounts(db, clock.now())).toBe(1);
		expect(db.select().from(user).where(eq(user.id, fresh.id)).get()!.erasedAt).toBeNull();
		expect(db.select().from(user).where(eq(user.id, ghost.id)).get()!.erasedAt).not.toBeNull();
		// An open invitation holds its account, and the steward's own is verified.
		expect(db.select().from(user).where(eq(user.id, invited.id)).get()!.erasedAt).toBeNull();
		expect(eraseAbandonedJoinAccounts(db, clock.now())).toBe(0);
	});

	it('erasing a person removes their open requests, and nobody else’s', () => {
		const token = linkOn();
		const marco = newcomer('m@example.org', true);
		const sofia = newcomer('s@example.org', true);
		requestToJoin(db, clock, { token, userId: marco.id });
		requestToJoin(db, clock, { token, userId: sofia.id });

		erasePerson(db, { userId: marco.id, actorId: steward.user.id, now: clock.now() });
		expect(requests().map((r) => r.userId)).toEqual([sofia.id]);
	});
});

describe('the verification mail is what tells the stewards', () => {
	beforeEach(() => resetAuthForTests());
	afterEach(() => {
		resetAuthForTests();
		resetMailTransportForTests();
	});

	it('runs through the library’s own verify endpoint', async () => {
		const mail = memoryTransport();
		setMailTransportForTests(mail);
		const auth = createAuth(db);
		const token = linkOn();

		await auth.api.signUpEmail({
			body: {
				email: 'marco@example.org',
				password: 'a-long-enough-password',
				name: 'Marco',
				callbackURL: '/join'
			}
		});
		const marco = db.select().from(user).where(eq(user.email, 'marco@example.org')).get()!;
		requestToJoin(db, clock, { token, userId: marco.id });
		expect(notesFor(steward.membership.id)).toHaveLength(0);

		const link = new URL(mail.sent.at(-1)!.url!);
		expect(link.searchParams.get('callbackURL')).toBe('/join');
		await auth.api
			.verifyEmail({
				query: { token: link.searchParams.get('token')!, callbackURL: '/join' },
				headers: new Headers()
			})
			// The endpoint answers with a redirect to the callback, thrown.
			.catch(() => undefined);

		expect(db.select().from(user).where(eq(user.id, marco.id)).get()!.emailVerified).toBe(true);
		expect(
			db
				.select()
				.from(joinRequest)
				.where(and(eq(joinRequest.userId, marco.id)))
				.get()!.notifiedAt
		).not.toBeNull();
		expect(notesFor(steward.membership.id)).toHaveLength(1);
	});
});

describe('the language of a join page', () => {
	const at = (path: string) =>
		({
			url: new URL(`http://localhost${path}`),
			request: new Request(`http://localhost${path}`, { headers: { 'accept-language': 'de' } })
		}) as unknown as Parameters<typeof joinLocale>[0];

	it('is the community’s for a working link, and the browser’s otherwise', () => {
		db.update(community).set({ locale: 'es' }).where(eq(community.id, steward.community.id)).run();
		expect(joinLocale(at(`/join/${linkOn()}`), db)).toBe('es');
		expect(joinLocale(at('/join/no-such-link'), db)).toBe('de');
		expect(joinLocale(at('/join'), db)).toBe('de');
		expect(joinLocale(at('/joinery'), db)).toBeNull();
	});

	it('survives a truncated escape in a pasted link', () => {
		expect(joinLocale(at('/join/%E0%A4%A'), db)).toBe('de');
	});
});

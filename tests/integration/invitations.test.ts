import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { setDbForTests } from '../../src/lib/server/db/index.js';
import { invitation, membership } from '../../src/lib/server/db/schema/tenancy.js';
import { auditEvent } from '../../src/lib/server/db/schema/tenancy.js';
import {
	INVITATION_TTL_MS,
	acceptInvitation,
	hashToken,
	inviteMember,
	listInvitations,
	revokeInvitation
} from '../../src/lib/server/services/invitations.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

const START = Date.UTC(2026, 8, 2, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;
let ctx: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	clock = fixedClock(START);

	const steward = makeUser(db, { email: 'ana@example.org' });
	const c = makeCommunity(db, { slug: 'valle-verde' });
	const m = makeMembership(db, c.id, steward.id, { role: 'steward', isOwner: true });
	ctx = { user: steward, community: c, membership: m, now: clock.now };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const invite = (email = 'marco@example.org') => inviteMember(ctx, { email }, { db });

describe('creating an invitation', () => {
	it('stores only a hash — the raw token exists in the email and nowhere else', () => {
		const { token } = invite();

		const rows = db.select().from(invitation).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.tokenHash).toBe(hashToken(token));
		// A copy of the database must not let anyone join anything.
		const dump = JSON.stringify(rows);
		expect(dump).not.toContain(token);
	});

	it('normalises the address, so a differently-cased invite is the same invite', () => {
		invite('Marco@Example.ORG');
		expect(db.select().from(invitation).all()[0]!.email).toBe('marco@example.org');
	});

	it('expires after seven days', () => {
		const { invitation: row } = invite();
		expect(row.expiresAt.getTime()).toBe(START + INVITATION_TTL_MS);
	});

	it('supersedes a live invitation rather than accumulating them', () => {
		invite();
		invite();

		const live = db
			.select()
			.from(invitation)
			.all()
			.filter((r) => !r.revokedAt);
		expect(live).toHaveLength(1);
	});

	it('refuses to invite someone who is already a member', () => {
		const existing = makeUser(db, { email: 'already@example.org' });
		makeMembership(db, ctx.community.id, existing.id);
		expect(() => invite('already@example.org')).toThrow();
	});

	it('records an audit event naming the invited address and role', () => {
		invite();
		const events = db
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'member.invited'))
			.all();
		expect(events).toHaveLength(1);
		expect(events[0]!.target).toBe('marco@example.org');
		expect(events[0]!.communityId).toBe(ctx.community.id);
	});

	it('is refused to a member', () => {
		const plain: Ctx = {
			...ctx,
			membership: { ...ctx.membership, role: 'member', isOwner: false }
		};
		expect(() => inviteMember(plain, { email: 'x@example.org' }, { db })).toThrow();
	});
});

describe('accepting an invitation', () => {
	const accept = (token: string, userId: string) => acceptInvitation(db, clock, { token, userId });

	it('creates the membership with the invited role', () => {
		const { token } = inviteMember(ctx, { email: 'marco@example.org', role: 'steward' }, { db });
		const marco = makeUser(db, { email: 'marco@example.org' });

		const result = accept(token, marco.id);

		expect(result.kind).toBe('accepted');
		const created = db.select().from(membership).where(eq(membership.userId, marco.id)).get();
		expect(created!.role).toBe('steward');
		expect(created!.isOwner).toBe(false);
	});

	it('refuses a second use', () => {
		const { token } = invite();
		const marco = makeUser(db, { email: 'marco@example.org' });
		accept(token, marco.id);

		expect(accept(token, marco.id).kind).toBe('already_used');
		expect(
			db
				.select()
				.from(membership)
				.all()
				.filter((m) => m.userId === marco.id)
		).toHaveLength(1);
	});

	it('refuses an address other than the one invited', () => {
		const { token } = invite();
		const someoneElse = makeUser(db, { email: 'lena@example.org' });

		// A forwarded email must not be a way into someone else's community.
		const result = accept(token, someoneElse.id);
		expect(result.kind).toBe('wrong_address');
		expect(
			db
				.select()
				.from(membership)
				.all()
				.filter((m) => m.userId === someoneElse.id)
		).toEqual([]);
	});

	it('refuses an expired invitation and says why', () => {
		const { token } = invite();
		const marco = makeUser(db, { email: 'marco@example.org' });

		clock.advance(INVITATION_TTL_MS + 1);
		expect(accept(token, marco.id).kind).toBe('expired');
	});

	it('refuses a revoked invitation', () => {
		const { token, invitation: row } = invite();
		revokeInvitation(ctx, row.id, { db });
		const marco = makeUser(db, { email: 'marco@example.org' });

		expect(accept(token, marco.id).kind).toBe('already_used');
	});

	it('refuses an unknown token without revealing anything', () => {
		const marco = makeUser(db, { email: 'marco@example.org' });
		expect(accept('not-a-real-token', marco.id).kind).toBe('unknown');
	});

	it('is idempotent under a race: two acceptances yield one membership', () => {
		const { token } = invite();
		const marco = makeUser(db, { email: 'marco@example.org' });

		const first = accept(token, marco.id);
		const second = accept(token, marco.id);

		expect(first.kind).toBe('accepted');
		expect(second.kind).toBe('already_used');
		expect(
			db
				.select()
				.from(membership)
				.all()
				.filter((m) => m.userId === marco.id)
		).toHaveLength(1);
	});

	it('records that the person joined', () => {
		const { token } = invite();
		const marco = makeUser(db, { email: 'marco@example.org' });
		accept(token, marco.id);

		const events = db.select().from(auditEvent).where(eq(auditEvent.action, 'member.joined')).all();
		expect(events).toHaveLength(1);
	});
});

describe('listing and revoking', () => {
	it('lists only invitations that have not been accepted', () => {
		invite('one@example.org');
		invite('two@example.org');
		expect(listInvitations(ctx, { db })).toHaveLength(2);
	});

	it('is refused to a member', () => {
		const plain: Ctx = {
			...ctx,
			membership: { ...ctx.membership, role: 'member', isOwner: false }
		};
		expect(() => listInvitations(plain, { db })).toThrow();
	});
});

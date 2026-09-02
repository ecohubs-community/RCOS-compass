import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { setDbForTests } from '../../src/lib/server/db/index.js';
import {
	auditEvent,
	community,
	invitation,
	membership
} from '../../src/lib/server/db/schema/tenancy.js';
import {
	DELETE_GRACE_MS,
	TenantError,
	createTenant,
	deleteTenant,
	listTenants,
	restoreTenant,
	suspendTenant,
	unsuspendTenant
} from '../../src/lib/server/services/admin/communities.js';
import { acceptInvitation } from '../../src/lib/server/services/invitations.js';
import { resolveCommunity } from '../../src/lib/server/services/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

const START = Date.UTC(2026, 8, 2, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;
/**
 * A platform admin is an ordinary user who happens to be listed in the
 * environment — not a synthetic id. The audit table's foreign key insists on
 * that, which is the right insistence: a trail pointing at an actor who never
 * existed answers nothing.
 */
let actor: { userId: string; email: string; ip: string };

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	clock = fixedClock(START);
	const admin = makeUser(db, { email: 'ops@example.org' });
	actor = { userId: admin.id, email: admin.email, ip: '203.0.113.9' };
});
afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const create = (slug = 'valle-verde', ownerEmail = 'ana@example.org') =>
	createTenant(db, clock, actor, { name: 'Valle Verde', slug, ownerEmail });

describe('creating a tenant', () => {
	it('creates the community and one pending owner invitation', () => {
		const { communityId, invitationToken } = create();

		const created = db.select().from(community).where(eq(community.id, communityId)).get();
		expect(created!.slug).toBe('valle-verde');

		const invitations = db.select().from(invitation).all();
		expect(invitations).toHaveLength(1);
		expect(invitations[0]!.grantsOwner).toBe(true);
		expect(invitations[0]!.role).toBe('steward');
		expect(invitationToken).toBeTruthy();
	});

	it('does not make the admin a member of it', () => {
		const { communityId } = create();
		const members = db
			.select()
			.from(membership)
			.where(eq(membership.communityId, communityId))
			.all();
		// Creating a tenant is an operational act, not a way into it.
		expect(members).toEqual([]);
	});

	it('records who created it', () => {
		create();
		const events = db
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'community.created'))
			.all();
		expect(events).toHaveLength(1);
		expect(events[0]!.actorEmail).toBe('ops@example.org');
		expect(events[0]!.ip).toBe('203.0.113.9');
	});

	it('refuses a reserved slug', () => {
		expect(() => create('admin')).toThrow(TenantError);
		try {
			create('admin');
		} catch (error) {
			expect((error as TenantError).reason).toBe('slug_reserved');
		}
	});

	it('refuses a slug that is taken', () => {
		create('valle-verde');
		try {
			create('valle-verde', 'someone@example.org');
			expect.unreachable('should have refused');
		} catch (error) {
			expect((error as TenantError).reason).toBe('slug_taken');
		}
	});

	it('refuses a malformed slug and a bad address', () => {
		try {
			create('Valle Verde');
		} catch (error) {
			expect((error as TenantError).reason).toBe('slug_malformed');
		}
		try {
			createTenant(db, clock, actor, { name: 'x', slug: 'ok-slug', ownerEmail: 'not-an-email' });
		} catch (error) {
			expect((error as TenantError).reason).toBe('invalid_email');
		}
	});

	it('makes the invited person the owner when they accept', () => {
		const { invitationToken } = create();
		const ana = makeUser(db, { email: 'ana@example.org' });

		const result = acceptInvitation(db, clock, { token: invitationToken, userId: ana.id });

		expect(result.kind).toBe('accepted');
		const created = db.select().from(membership).where(eq(membership.userId, ana.id)).get();
		expect(created!.isOwner).toBe(true);
		expect(created!.role).toBe('steward');
	});
});

describe('listing tenants', () => {
	it('reports counts and the owner’s address, and nothing else about people', () => {
		const { invitationToken } = create();
		const ana = makeUser(db, { email: 'ana@example.org' });
		acceptInvitation(db, clock, { token: invitationToken, userId: ana.id });

		const [tenant] = listTenants(db);
		expect(tenant!.members).toBe(1);
		expect(tenant!.ownerEmail).toBe('ana@example.org');
		expect(tenant!.pendingInvitations).toBe(0);
		// The shape is the boundary: no content fields exist to leak.
		expect(Object.keys(tenant!).sort()).toEqual(
			[
				'createdAt',
				'id',
				'members',
				'name',
				'ownerEmail',
				'pendingInvitations',
				'slug',
				'status'
			].sort()
		);
	});

	it('shows a community with no accepted owner as pending', () => {
		create();
		expect(listTenants(db)[0]!.ownerEmail).toBeNull();
		expect(listTenants(db)[0]!.pendingInvitations).toBe(1);
	});
});

describe('suspension', () => {
	it('leaves members able to read, and says why', () => {
		const c = makeCommunity(db, { slug: 'paused' });
		const person = makeUser(db);
		makeMembership(db, c.id, person.id, { role: 'steward' });

		suspendTenant(db, clock, actor, c.id, 'Non-payment');

		const resolution = resolveCommunity(db, 'paused', person.id);
		expect(resolution.kind).toBe('read_only');
		if (resolution.kind === 'read_only') expect(resolution.reason).toBe('Non-payment');
	});

	it('requires a reason', () => {
		const c = makeCommunity(db, { slug: 'paused' });
		expect(() => suspendTenant(db, clock, actor, c.id, '   ')).toThrow(TenantError);
	});

	it('is reversible', () => {
		const c = makeCommunity(db, { slug: 'paused' });
		const person = makeUser(db);
		makeMembership(db, c.id, person.id);

		suspendTenant(db, clock, actor, c.id, 'Non-payment');
		unsuspendTenant(db, clock, actor, c.id);

		expect(resolveCommunity(db, 'paused', person.id).kind).toBe('ok');
	});
});

describe('deletion', () => {
	it('hides the community from its own members immediately', () => {
		const c = makeCommunity(db, { slug: 'gone' });
		const person = makeUser(db);
		makeMembership(db, c.id, person.id, { role: 'steward' });

		deleteTenant(db, clock, actor, c.id, 'Requested by the owner');

		expect(resolveCommunity(db, 'gone', person.id).kind).toBe('not_found');
	});

	it('keeps the data and restores it within the grace period', () => {
		const c = makeCommunity(db, { slug: 'gone' });
		const person = makeUser(db);
		makeMembership(db, c.id, person.id, { role: 'steward' });

		deleteTenant(db, clock, actor, c.id, 'Mistake');
		clock.advance(DELETE_GRACE_MS - 1000);
		restoreTenant(db, clock, actor, c.id);

		const resolution = resolveCommunity(db, 'gone', person.id);
		expect(resolution.kind).toBe('ok');
		// The membership survived, so restoring is a restoration and not a reset.
		expect(db.select().from(membership).where(eq(membership.communityId, c.id)).all()).toHaveLength(
			1
		);
	});

	it('refuses to restore once the grace period has passed', () => {
		const c = makeCommunity(db, { slug: 'gone' });
		deleteTenant(db, clock, actor, c.id, 'Requested');
		clock.advance(DELETE_GRACE_MS + 1);

		expect(() => restoreTenant(db, clock, actor, c.id)).toThrow(TenantError);
	});

	it('records the reason and when the data may be purged', () => {
		const c = makeCommunity(db, { slug: 'gone' });
		deleteTenant(db, clock, actor, c.id, 'Requested by the owner');

		const [event] = db
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'community.deleted'))
			.all();
		expect((event!.meta as { reason: string }).reason).toBe('Requested by the owner');
		expect((event!.meta as { purgeAfter: number }).purgeAfter).toBe(START + DELETE_GRACE_MS);
	});
});

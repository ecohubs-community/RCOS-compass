import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	community,
	communitySlugRedirect,
	membership
} from '../../src/lib/server/db/schema/tenancy.js';
import { listAudit, type AuditAction } from '../../src/lib/server/services/audit.js';
import {
	SLUG_REDIRECT_MS,
	TenantError,
	changeTenantSlug,
	createTenant,
	getTenant,
	renameTenant,
	setTenantFlags,
	setTenantLimits,
	transferOwnership,
	type AdminActor
} from '../../src/lib/server/services/admin/communities.js';
import { resolveCommunity, resolveSlugRedirect } from '../../src/lib/server/services/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeMembership, makeUser } from '../support/factories.js';

/**
 * docs/05-admin-console.md §3.3 — the tenant-detail actions.
 *
 * Every one of them is metadata-only and every one writes exactly one audit
 * event with before and after (§5.4), which is what these assert alongside the
 * behaviour itself.
 */
const START = Date.UTC(2026, 8, 2, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;
let actor: AdminActor;
let communityId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	clock = fixedClock(START);
	const admin = makeUser(db, { email: 'ops@example.org' });
	actor = { userId: admin.id, email: admin.email, ip: '203.0.113.9' };
	({ communityId } = createTenant(db, clock, actor, {
		name: 'Valle Verde',
		slug: 'valle-verde',
		ownerEmail: 'ana@example.org'
	}));
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const row = () => db.select().from(community).where(eq(community.id, communityId)).get()!;
const eventsOf = (action: AuditAction) => listAudit({ action, communityId }, db);

describe('renaming', () => {
	it('changes the name, leaves the address alone, and records both values', () => {
		renameTenant(db, clock, actor, communityId, 'Valle Verde Ecoaldea');

		expect(row().name).toBe('Valle Verde Ecoaldea');
		expect(row().slug, 'a rename must not move the address').toBe('valle-verde');

		const [event] = eventsOf('community.renamed');
		expect(event!.meta).toMatchObject({ from: 'Valle Verde', to: 'Valle Verde Ecoaldea' });
	});

	it('writes nothing when the name has not changed', () => {
		renameTenant(db, clock, actor, communityId, 'Valle Verde');
		expect(eventsOf('community.renamed')).toHaveLength(0);
	});

	it('refuses a name too short to identify anything', () => {
		expect(() => renameTenant(db, clock, actor, communityId, 'V')).toThrow(TenantError);
	});
});

describe('changing the address', () => {
	it('moves the slug and leaves the old one redirecting for ninety days', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');

		expect(row().slug).toBe('valle-verde-ec');
		expect(resolveSlugRedirect(db, 'valle-verde', clock.now())).toBe('valle-verde-ec');

		const [redirect] = db.select().from(communitySlugRedirect).all();
		expect(redirect!.expiresAt.getTime()).toBe(START + SLUG_REDIRECT_MS);
	});

	it('stops redirecting once the window has passed', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');

		clock.advance(SLUG_REDIRECT_MS + 1);
		// The promise was ninety days, not forever; after that the name is free.
		expect(resolveSlugRedirect(db, 'valle-verde', clock.now())).toBeNull();
	});

	it('does not shadow a live community with a stale redirect', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');
		// Someone else takes the freed name. The redirect must not intercept it.
		const other = createTenant(db, clock, actor, {
			name: 'Another Place',
			slug: 'valle-verde-2',
			ownerEmail: 'other@example.org'
		});

		const resolution = resolveCommunity(db, 'valle-verde-2', null);
		expect(resolution.kind).toBe('not_found'); // anonymous, but it exists
		expect(getTenant(db, other.communityId)!.slug).toBe('valle-verde-2');
	});

	it('refuses a retired slug that still points at another community', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');
		const other = createTenant(db, clock, actor, {
			name: 'Another Place',
			slug: 'other-place',
			ownerEmail: 'other@example.org'
		});

		// Handing a redirecting name to a different tenant would silently point
		// old links at the wrong community — worse than breaking them.
		expect(() => changeTenantSlug(db, clock, actor, other.communityId, 'valle-verde')).toThrow(
			TenantError
		);
	});

	it('lets a community take its own retired slug back without redirecting to itself', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde');

		expect(row().slug).toBe('valle-verde');
		expect(resolveSlugRedirect(db, 'valle-verde', clock.now())).toBeNull();
		expect(resolveSlugRedirect(db, 'valle-verde-ec', clock.now())).toBe('valle-verde');
	});

	it('refuses a reserved or malformed address', () => {
		expect(() => changeTenantSlug(db, clock, actor, communityId, 'admin')).toThrow(TenantError);
		expect(() => changeTenantSlug(db, clock, actor, communityId, 'Not A Slug')).toThrow(
			TenantError
		);
	});

	it('records where the links used to point and until when', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');
		const [event] = eventsOf('community.slug_changed');
		expect(event!.meta).toMatchObject({
			from: 'valle-verde',
			to: 'valle-verde-ec',
			redirectUntil: START + SLUG_REDIRECT_MS
		});
	});
});

describe('limits', () => {
	const limits = { maxMembers: 150, storageMb: 4096, aiMonthlyTokens: 500_000 };
	const none = { maxMembers: null, storageMb: null, aiMonthlyTokens: null };

	it('sets them, and blank means the instance default again', () => {
		setTenantLimits(db, clock, actor, communityId, limits, 'pilot allocation');
		expect(getTenant(db, communityId)!.limits).toEqual(limits);

		// Widening needs no reason: nobody is worse off for it.
		setTenantLimits(db, clock, actor, communityId, none, '');
		expect(getTenant(db, communityId)!.limits).toEqual(none);
	});

	it('treats the first number as a reduction, because unlimited was the start', () => {
		// Plans are unlimited during the testing phase, so naming any ceiling can
		// put a community over it immediately — however generous the number looks.
		expect(() => setTenantLimits(db, clock, actor, communityId, limits, '')).toThrow(
			/needs a reason/
		);
		expect(getTenant(db, communityId)!.limits).toEqual(none);
	});

	it('needs a reason to tighten one further', () => {
		setTenantLimits(db, clock, actor, communityId, limits, 'pilot allocation');

		expect(() =>
			setTenantLimits(db, clock, actor, communityId, { ...limits, maxMembers: 20 }, '')
		).toThrow(TenantError);

		setTenantLimits(db, clock, actor, communityId, { ...limits, maxMembers: 20 }, 'pilot only');
		expect(getTenant(db, communityId)!.limits.maxMembers).toBe(20);
	});

	it('raises one without ceremony', () => {
		setTenantLimits(db, clock, actor, communityId, limits, 'pilot allocation');
		setTenantLimits(db, clock, actor, communityId, { ...limits, maxMembers: 300 }, '');
		expect(getTenant(db, communityId)!.limits.maxMembers).toBe(300);
	});

	it('refuses a limit that is not a whole number of things', () => {
		expect(() =>
			setTenantLimits(db, clock, actor, communityId, { ...limits, storageMb: -1 }, 'x')
		).toThrow(TenantError);
	});

	it('records both values and the reason on the event', () => {
		setTenantLimits(db, clock, actor, communityId, limits, 'pilot allocation');
		setTenantLimits(db, clock, actor, communityId, { ...limits, storageMb: 512 }, 'over budget');

		const [latest] = eventsOf('community.limits_changed');
		expect(latest!.meta).toMatchObject({
			from: { storageMb: 4096 },
			to: { storageMb: 512 },
			tightened: true,
			reason: 'over budget'
		});
	});
});

describe('feature flags', () => {
	it('default to off and can be turned on one at a time', () => {
		expect(getTenant(db, communityId)!.flags).toEqual({
			aiEnabled: false,
			gitMirrorEnabled: false,
			publicIndexEnabled: false
		});

		setTenantFlags(db, clock, actor, communityId, {
			aiEnabled: true,
			gitMirrorEnabled: false,
			publicIndexEnabled: false
		});

		expect(getTenant(db, communityId)!.flags.aiEnabled).toBe(true);
		expect(eventsOf('community.flags_changed')[0]!.meta).toMatchObject({
			from: { aiEnabled: false },
			to: { aiEnabled: true }
		});
	});
});

describe('transferring ownership', () => {
	function steward(email: string, isOwner = false) {
		const person = makeUser(db, { email });
		makeMembership(db, communityId, person.id, { role: 'steward', isOwner });
		return person;
	}

	it('moves the flag between stewards', () => {
		const ana = steward('ana@example.org', true);
		const marco = steward('marco@example.org');

		transferOwnership(db, clock, actor, communityId, marco.id);

		const rows = db.select().from(membership).where(eq(membership.communityId, communityId)).all();
		expect(rows.find((m) => m.userId === marco.id)!.isOwner).toBe(true);
		expect(rows.find((m) => m.userId === ana.id)!.isOwner).toBe(false);
		expect(
			rows.filter((m) => m.isOwner),
			'exactly one owner, always'
		).toHaveLength(1);
	});

	it('refuses to leave a single-steward community, and says what to do instead', () => {
		const ana = steward('ana@example.org', true);
		const person = makeUser(db, { email: 'lena@example.org' });
		makeMembership(db, communityId, person.id, { role: 'member' });

		expect(() => transferOwnership(db, clock, actor, communityId, person.id)).toThrow(
			/current steward/
		);
		// Not to the plain member, and not away from the only steward either.
		expect(() => transferOwnership(db, clock, actor, communityId, ana.id)).toThrow(TenantError);
	});

	it('refuses a member who is not in this community at all', () => {
		steward('ana@example.org', true);
		steward('marco@example.org');
		const outsider = makeUser(db, { email: 'nobody@example.org' });

		expect(() => transferOwnership(db, clock, actor, communityId, outsider.id)).toThrow(
			TenantError
		);
	});

	it('refuses to hand the flag to whoever already has it', () => {
		const ana = steward('ana@example.org', true);
		steward('marco@example.org');
		expect(() => transferOwnership(db, clock, actor, communityId, ana.id)).toThrow(TenantError);
	});

	it('records who gave it up and who received it', () => {
		const ana = steward('ana@example.org', true);
		const marco = steward('marco@example.org');
		transferOwnership(db, clock, actor, communityId, marco.id);

		expect(eventsOf('community.ownership_transferred')[0]!.meta).toMatchObject({
			from: ana.id,
			to: marco.id
		});
	});
});

describe('a retired address discloses nothing', () => {
	it('resolves for a member of the community it points at', () => {
		const person = makeUser(db, { email: 'ana@example.org' });
		makeMembership(db, communityId, person.id, { role: 'steward', isOwner: true });
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');

		// The redirect target itself is what the layout checks before offering the
		// redirect, so this is the condition that decides whether it is offered.
		expect(resolveSlugRedirect(db, 'valle-verde', clock.now())).toBe('valle-verde-ec');
		expect(resolveCommunity(db, 'valle-verde-ec', person.id).kind).toBe('ok');
	});

	it('leads nowhere for someone who is not a member', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');
		const outsider = makeUser(db, { email: 'nobody@example.org' });

		// The redirect row exists — but the community behind it does not resolve
		// for them, so the layout must 404 rather than 308. Redirecting would
		// disclose both that the old slug existed and what it became.
		expect(resolveSlugRedirect(db, 'valle-verde', clock.now())).toBe('valle-verde-ec');
		expect(resolveCommunity(db, 'valle-verde-ec', outsider.id).kind).toBe('not_found');
		expect(resolveCommunity(db, 'valle-verde-ec', null).kind).toBe('not_found');
	});

	it('leads nowhere once the community is deleted', () => {
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');
		db.update(community).set({ status: 'deleted' }).where(eq(community.id, communityId)).run();

		expect(resolveSlugRedirect(db, 'valle-verde', clock.now())).toBeNull();
	});
});

describe('the detail view', () => {
	it('carries metadata, stewards and retired addresses — and no content', () => {
		const person = makeUser(db, { email: 'ana@example.org' });
		makeMembership(db, communityId, person.id, { role: 'steward', isOwner: true });
		changeTenantSlug(db, clock, actor, communityId, 'valle-verde-ec');

		const detail = getTenant(db, communityId)!;

		expect(detail.slug).toBe('valle-verde-ec');
		expect(detail.timezone).toBe('UTC');
		expect(detail.stewards).toEqual([
			{ userId: person.id, email: 'ana@example.org', isOwner: true }
		]);
		expect(detail.retiredSlugs).toEqual([
			{ slug: 'valle-verde', expiresAt: START + SLUG_REDIRECT_MS }
		]);
	});

	it('is null for a community that does not exist', () => {
		expect(getTenant(db, 'no-such-id')).toBeNull();
	});
});

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { membership } from '../../src/lib/server/db/schema/tenancy.js';
import {
	endMembership,
	listFormerMembers,
	listMembers,
	setMemberRole
} from '../../src/lib/server/services/members.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The community's own register, which had services and no screen until P7's
 * exit spec went looking for a member list to assert against.
 *
 * The two lists are the point. `endMembership` ends access and keeps the row,
 * because a decision refers to the memberships that consented to it — so a
 * departure has to move somebody from one list to the other rather than out of
 * the record, and the two of them together have to still add up to what the
 * register says.
 */
const START = Date.UTC(2026, 8, 2, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let plain: Ctx;
/** A steward who does not own the community — the only actor self-removal is about. */
let steward: Ctx;
let marco: { membershipId: string };

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const clock = fixedClock(START);

	const community = makeCommunity(db, { slug: 'valle-verde' });

	const ana = makeUser(db, { email: 'ana@example.org', name: 'Ana Restrepo' });
	ctx = {
		user: ana,
		community,
		membership: makeMembership(db, community.id, ana.id, { role: 'steward', isOwner: true }),
		now: clock.now
	};

	const person = makeUser(db, { email: 'marco@example.org', name: 'Marco Díaz' });
	const seat = makeMembership(db, community.id, person.id, { role: 'member' });
	marco = { membershipId: seat.id };
	plain = { user: person, community, membership: seat, now: clock.now };

	const lena = makeUser(db, { email: 'lena@example.org', name: 'Lena Vogt' });
	steward = {
		user: lena,
		community,
		membership: makeMembership(db, community.id, lena.id, { role: 'steward' }),
		now: clock.now
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('reading the register', () => {
	it('names everyone through personLabel, with the number their membership carries', () => {
		const rows = listMembers(ctx);

		expect(rows.map((row) => [row.name, row.number, row.role, row.isOwner])).toEqual([
			['Ana Restrepo', 'M-0001', 'steward', true],
			['Marco Díaz', 'M-0002', 'member', false],
			['Lena Vogt', 'M-0003', 'steward', false]
		]);
	});

	it('prefers the name somebody chose in this community to the one on their account', () => {
		db.update(membership)
			.set({ displayName: 'Marco D.' })
			.where(eq(membership.id, marco.membershipId))
			.run();

		expect(listMembers(ctx).map((row) => row.name)).toContain('Marco D.');
	});

	it('is readable by a member, not only by a steward', () => {
		// Knowing who you are governing with is not a privilege. Deciding it is.
		expect(listMembers(plain)).toHaveLength(3);
		expect(listFormerMembers(plain)).toEqual([]);
	});

	it('shows nobody from another community', () => {
		const elsewhere = makeCommunity(db, { slug: 'other-valley' });
		const stranger = makeUser(db, { email: 'stranger@example.org', name: 'Someone Else' });
		makeMembership(db, elsewhere.id, stranger.id, { role: 'steward', isOwner: true });

		expect(listMembers(ctx).map((row) => row.name)).not.toContain('Someone Else');
	});
});

describe('ending a membership', () => {
	it('moves them to the other list rather than out of the record', () => {
		endMembership(ctx, marco.membershipId);

		expect(listMembers(ctx).map((row) => row.name)).toEqual(['Ana Restrepo', 'Lena Vogt']);
		const gone = listFormerMembers(ctx);
		// The row, the number and the date they left — everything a tally of a
		// decision they consented to still needs.
		expect(gone.map((row) => [row.name, row.number, row.endedAt])).toEqual([
			['Marco Díaz', 'M-0002', START]
		]);
	});

	it('does not free the number for whoever joins next', () => {
		endMembership(ctx, marco.membershipId);

		const newcomer = makeUser(db, { email: 'tomas@example.org', name: 'Tomás Rey' });
		makeMembership(db, ctx.community.id, newcomer.id, { role: 'member' });

		expect(listMembers(ctx).map((row) => row.number)).toEqual(['M-0001', 'M-0003', 'M-0004']);
	});

	it('refuses the owner, and says what to do instead', () => {
		// A community with no owner cannot be transferred, suspended or closed.
		const refused = catchRefusal(() => endMembership(ctx, ctx.membership.id));
		expect(refused?.status).toBe(409);
		expect(refused?.message).toMatch(/Transfer ownership/);
	});

	it('is not something a member may do', () => {
		expect(catchRefusal(() => endMembership(plain, marco.membershipId))?.status).toBe(403);
		expect(listMembers(ctx)).toHaveLength(3);
	});

	it('refuses a steward removing themselves', () => {
		// The one removal nobody left in the community can undo: a steward who
		// ends their own membership is not a member who can be promoted back, and
		// a community whose last steward did it has nobody who can record
		// anything.
		const refused = catchRefusal(() => endMembership(steward, steward.membership.id));
		expect(refused?.status).toBe(409);
		expect(refused?.message).toMatch(/another steward/i);
		expect(listMembers(ctx)).toHaveLength(3);
	});

	it('still lets that steward remove somebody else', () => {
		// So the refusal above is about who it is aimed at, not about the actor
		// having lost the capability.
		endMembership(steward, marco.membershipId);
		expect(listFormerMembers(ctx).map((row) => row.name)).toEqual(['Marco Díaz']);
	});

	it('does not find a membership in another community', () => {
		const elsewhere = makeCommunity(db, { slug: 'other-valley' });
		const stranger = makeUser(db, { email: 'stranger@example.org' });
		const theirs = makeMembership(db, elsewhere.id, stranger.id, { role: 'member' });

		// Not found rather than forbidden: existence is not disclosed across the
		// tenant boundary.
		expect(catchRefusal(() => endMembership(ctx, theirs.id))?.status).toBe(404);
	});
});

describe('changing a role', () => {
	it('takes effect on the list a steward is reading', () => {
		setMemberRole(ctx, marco.membershipId, 'steward');

		expect(listMembers(ctx).map((row) => row.role)).toEqual(['steward', 'steward', 'steward']);
	});

	it('refuses to demote the owner', () => {
		const refused = catchRefusal(() => setMemberRole(ctx, ctx.membership.id, 'member'));
		expect(refused?.status).toBe(409);
		expect(refused?.message).toMatch(/Transfer ownership/);
	});

	it('is not something a member may do, even to themselves', () => {
		expect(catchRefusal(() => setMemberRole(plain, plain.membership.id, 'steward'))?.status).toBe(
			403
		);
	});

	it('refuses a steward changing their own', () => {
		// A steward who demotes themselves by mistake is a member, and a member
		// may not promote anybody — including back.
		const refused = catchRefusal(() => setMemberRole(steward, steward.membership.id, 'member'));
		expect(refused?.status).toBe(409);
		expect(refused?.message).toMatch(/another steward/i);
		expect(listMembers(ctx).map((row) => row.role)).toEqual(['steward', 'member', 'steward']);
	});

	it('still lets that steward change somebody else’s', () => {
		setMemberRole(steward, marco.membershipId, 'steward');
		expect(listMembers(ctx).map((row) => row.role)).toEqual(['steward', 'steward', 'steward']);
	});

	it('gives the owner the instruction that is useful to them, not the self one', () => {
		// The owner acting on their own row is both cases at once. Transferring is
		// the way out; being told to ask somebody else would be a dead end.
		const refused = catchRefusal(() => endMembership(ctx, ctx.membership.id));
		expect(refused?.message).toMatch(/Transfer ownership/);
	});
});

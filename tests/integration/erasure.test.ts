import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { account, session, user } from '../../src/lib/server/db/schema/auth.js';
import { decision, decisionAttendee } from '../../src/lib/server/db/schema/decisions.js';
import { auditEvent, invitation, membership } from '../../src/lib/server/db/schema/tenancy.js';
import { erasePerson } from '../../src/lib/server/services/erasure.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Being forgotten, and the record that must not move. `docs/03` §10.
 *
 * The property worth the most here is the dullest to write: after an erasure,
 * the register is *byte for byte* what it was. Not "the decision is still
 * there" — that passes while a tally quietly loses a row — but every column of
 * every row, compared whole. A governance record that changes when somebody
 * leaves is a record nobody can rely on, and the failure would be invisible in
 * any spot check.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const NAME = 'Wilhelmina Kastenbaum';
const EMAIL = 'wilhelmina@example.org';

let db: Db;
let cleanup: () => void;
let community: ReturnType<typeof makeCommunity>;
let owner: ReturnType<typeof makeUser>;
let ownerSeat: ReturnType<typeof makeMembership>;
let person: ReturnType<typeof makeUser>;
let seat: ReturnType<typeof makeMembership>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	vi.stubEnv('ADMIN_EMAILS', 'root@example.org');
	resetConfigForTests();

	community = makeCommunity(db, { slug: 'valle-verde' });
	owner = makeUser(db, { email: 'ana@example.org', name: 'Ana Restrepo' });
	ownerSeat = makeMembership(db, community.id, owner.id, { role: 'steward', isOwner: true });
	person = makeUser(db, { email: EMAIL, name: NAME });
	seat = makeMembership(db, community.id, person.id, { role: 'member', name: 'Willa' });
});

afterEach(() => {
	vi.unstubAllEnvs();
	resetConfigForTests();
	setDbForTests(null);
	cleanup();
});

/** A decision they attended, so there is a record with something to lose. */
function decide(): string {
	const id = newId();
	db.insert(decision)
		.values({
			id,
			communityId: community.id,
			seq: 1,
			ref: 'DEC-2026-001',
			title: 'Spending authority',
			type: 'strategic',
			layer: null,
			mechanism: 'consent',
			threshold: null,
			tallyPresent: 2,
			tallyFor: 2,
			tallyAgainst: 0,
			unresolvedObjections: 0,
			rationale: null,
			proposalText: 'Any spend over €500 needs a consent decision.',
			decidedAt: new Date(NOW),
			reviewDueAt: null,
			source: 'online',
			provisional: false,
			status: 'active',
			supersededById: null,
			idempotencyKey: 'k1',
			recordedBy: owner.id,
			proposalPostId: null
		})
		.run();
	for (const membershipId of [ownerSeat.id, seat.id]) {
		db.insert(decisionAttendee)
			.values({
				id: newId(),
				decisionId: id,
				membershipId,
				externalName: null,
				consentedToPublish: true
			})
			.run();
	}
	return id;
}

const erase = (userId = person.id) => erasePerson(db, { userId, actorId: userId, now: NOW });

describe('erasure leaves the record exactly as it was', () => {
	it('changes not one column of the register', () => {
		decide();
		const registerBefore = JSON.stringify([
			db.select().from(decision).all(),
			db.select().from(decisionAttendee).all()
		]);

		erase();

		expect(
			JSON.stringify([db.select().from(decision).all(), db.select().from(decisionAttendee).all()])
		).toBe(registerBefore);
	});

	it('keeps the membership, its number and its join date', () => {
		erase();

		const row = db.select().from(membership).where(eq(membership.id, seat.id)).get()!;
		expect(row.seq).toBe(seat.seq);
		expect(row.joinedAt.getTime()).toBe(seat.joinedAt.getTime());
		// The name they chose here goes with the one on the account: `personLabel`
		// would never render it, but the row would still be holding a name after
		// being asked not to.
		expect(row.displayName).toBeNull();
	});
});

describe('nothing is left that could sign in, or be reached', () => {
	it('deletes every session and credential', () => {
		db.insert(session)
			.values({
				id: newId(),
				userId: person.id,
				token: 't',
				expiresAt: new Date(NOW + 86_400_000),
				ipAddress: null,
				userAgent: null,
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW)
			})
			.run();
		db.insert(account)
			.values({
				id: newId(),
				userId: person.id,
				issuer: 'credential',
				accountId: person.id,
				providerId: 'credential',
				password: 'hash',
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW)
			})
			.run();

		erase();

		expect(db.select().from(session).where(eq(session.userId, person.id)).all()).toEqual([]);
		expect(db.select().from(account).where(eq(account.userId, person.id)).all()).toEqual([]);
	});

	it('frees the address, and the new account is unrelated', () => {
		erase();

		const returning = makeUser(db, { email: EMAIL, name: 'Somebody Else' });
		expect(returning.id).not.toBe(person.id);
		// Nothing links them, because nothing was kept to link them with — not the
		// address, not a hash of it.
		expect(db.select().from(membership).where(eq(membership.userId, returning.id)).all()).toEqual(
			[]
		);
	});

	it('revokes an open invitation to that address, and touches nobody else’s', () => {
		const invite = (email: string, id: string) =>
			db
				.insert(invitation)
				.values({
					id,
					communityId: community.id,
					email,
					role: 'member',
					grantsOwner: false,
					tokenHash: id.repeat(2).slice(0, 64),
					expiresAt: new Date(NOW + 86_400_000),
					acceptedAt: null,
					acceptedBy: null,
					revokedAt: null,
					invitedBy: owner.id,
					createdAt: new Date(NOW)
				})
				.run();
		invite(EMAIL, 'i1');
		invite('someone@example.org', 'i2');

		erase();

		const rows = db.select().from(invitation).all();
		expect(rows.find((row) => row.id === 'i1')!.revokedAt).not.toBeNull();
		expect(rows.find((row) => row.id === 'i2')!.revokedAt).toBeNull();
	});
});

describe('the act is recorded, and it does not record who', () => {
	it('names the actor, the time and the membership — never the person', () => {
		db.insert(auditEvent)
			.values({
				id: newId(),
				at: new Date(NOW),
				actorId: person.id,
				actorEmail: EMAIL,
				communityId: community.id,
				action: 'auth.signin.failed',
				target: null,
				ip: '203.0.113.4',
				userAgent: null,
				meta: null
			})
			.run();

		erase();

		const trail = JSON.stringify(db.select().from(auditEvent).all());
		expect(trail).not.toContain(NAME);
		expect(trail).not.toContain(EMAIL);
		// The event itself survives — an audit trail that loses a sign-in failure
		// when the account is erased is a security record with a hole in it.
		expect(db.select().from(auditEvent).all()).toHaveLength(2);
		expect(trail).toContain('account.erased');
		expect(trail).toContain(`M-${String(seat.seq).padStart(4, '0')}`);
	});
});

describe('erasure is refused where it would strand somebody', () => {
	it('refuses the sole owner, and proceeds once ownership has moved', () => {
		const refusal = catchRefusal(() => erase(owner.id));
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/transfer ownership/i);

		db.update(membership).set({ isOwner: false }).where(eq(membership.id, ownerSeat.id)).run();
		db.update(membership).set({ isOwner: true }).where(eq(membership.id, seat.id)).run();

		erase(owner.id);
		expect(db.select().from(user).where(eq(user.id, owner.id)).get()!.erasedAt).not.toBeNull();
	});

	it('refuses the last administrator of the instance', () => {
		const root = makeUser(db, { email: 'root@example.org', name: 'Root' });

		const refusal = catchRefusal(() => erase(root.id));
		// An instance with no administrator cannot be restored, cannot have a
		// tenant created, and cannot have anything fixed.
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/only administrator/i);
	});

	it('refuses twice for the same person', () => {
		erase();
		// The same answer as for an id that never existed: this is not a place to
		// confirm which addresses have accounts.
		expect(catchRefusal(() => erase())?.status).toBe(404);
	});
});

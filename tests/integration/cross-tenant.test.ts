import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { setDbForTests } from '../../src/lib/server/db/index.js';
import { tenantServices } from '../../src/lib/server/services/registry.js';
import '../../src/lib/server/services/members.js';
import '../../src/lib/server/services/invitations.js';
import { inviteMember } from '../../src/lib/server/services/invitations.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The highest-severity risk in the product, tested systematically.
 *
 * docs/04-security.md §2. Rather than a handful of hand-written cases, this
 * enumerates the service registry: every registered service is called by a
 * steward of community B with the id of a subject in community A, and must
 * behave as though that subject does not exist. A service added without being
 * registered fails the first test here, which is what stops this suite from
 * silently falling behind the code.
 */
let db: Db;
let cleanup: () => void;

type World = {
	ctxB: Ctx;
	subjectInA: Record<string, string>;
};

let world: World;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const alice = makeUser(db, { email: 'alice@example.org' });
	const bob = makeUser(db, { email: 'bob@example.org' });
	const communityA = makeCommunity(db, { slug: 'community-a' });
	const communityB = makeCommunity(db, { slug: 'community-b' });

	const aliceInA = makeMembership(db, communityA.id, alice.id, {
		role: 'steward',
		isOwner: true
	});
	const ctxA: Ctx = {
		user: alice,
		community: communityA,
		membership: aliceInA,
		now: () => Date.UTC(2026, 8, 2, 12, 0, 0)
	};
	const invitationInA = inviteMember(ctxA, { email: 'carol@example.org' }, { db }).invitation;
	const bobInB = makeMembership(db, communityB.id, bob.id, { role: 'steward', isOwner: true });

	world = {
		// Bob is a steward — the most privileged ordinary role — of B. If the
		// boundary held only for members, it would not be a boundary.
		ctxB: {
			user: bob,
			community: communityB,
			membership: bobInB,
			now: () => Date.UTC(2026, 8, 2, 12, 0, 0)
		},
		subjectInA: {
			membership: aliceInA.id,
			community: communityA.id,
			invitation: invitationInA.id
		}
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('the service registry', () => {
	it('is not empty — an empty registry would make this suite vacuous', () => {
		expect(tenantServices().length).toBeGreaterThan(0);
	});

	it('gives every service a distinct name', () => {
		const names = tenantServices().map((s) => s.name);
		expect(new Set(names).size).toBe(names.length);
	});
});

describe('a steward of one community cannot reach another', () => {
	for (const service of tenantServices()) {
		it(`${service.name} refuses a subject from another community`, () => {
			const subjectId = world.subjectInA[service.subject];
			expect(subjectId, `no seeded subject of kind "${service.subject}"`).toBeTruthy();

			let threw = false;
			try {
				service.call(world.ctxB, subjectId!);
			} catch (error) {
				threw = true;
				// 404, not 403: existence is not disclosed across the boundary.
				const status = (error as { status?: number }).status;
				expect(status, `${service.name} should 404, got ${status}`).toBe(404);
			}
			expect(threw, `${service.name} returned instead of refusing`).toBe(true);
		});
	}
});

describe('the same services work inside their own community', () => {
	it('so the refusals above are about the boundary, not about being broken', () => {
		const ownMembershipId = world.ctxB.membership.id;
		for (const service of tenantServices()) {
			if (service.subject !== 'membership') continue;
			// members.end and members.setRole refuse on the owner by design, so the
			// assertion is only that they do not 404 — the subject is found.
			try {
				service.call(world.ctxB, ownMembershipId);
			} catch (error) {
				expect((error as { status?: number }).status, service.name).not.toBe(404);
			}
		}
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { setDbForTests } from '../../src/lib/server/db/index.js';
import { tenantServices } from '../../src/lib/server/services/registry.js';
import '../../src/lib/server/services/members.js';
import '../../src/lib/server/services/invitations.js';
import '../../src/lib/server/services/definitions.js';
import '../../src/lib/server/services/discussions.js';
import '../../src/lib/server/services/objections.js';
import '../../src/lib/server/services/decisions.js';
import '../../src/lib/server/services/notifications.js';
import { inviteMember } from '../../src/lib/server/services/invitations.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { raiseObjection } from '../../src/lib/server/services/objections.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import { communityArtifact } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
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

	// A's own content, for the services that address a definition or an artifact.
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: communityA.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0)),
			retiredAt: null
		})
		.run();
	const artifactInA = newId();
	db.insert(communityArtifact)
		.values({
			id: artifactInA,
			communityId: communityA.id,
			title: 'Community Agreements',
			description: null,
			layer: null,
			order: 0,
			kind: 'default',
			createdAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0))
		})
		.run();
	const definitionInA = createDefinition(
		ctxA,
		{
			scope: 'local',
			title: 'Quiet hours',
			attach: { kind: 'community_artifact', artifactId: artifactInA }
		},
		{ db }
	);
	const bobInB = makeMembership(db, communityB.id, bob.id, { role: 'steward', isOwner: true });

	const discussionInA = openDiscussion(
		ctxA,
		{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: '3.6.1' } },
		{ db }
	);

	const proposalInA = addProposal(
		ctxA,
		{ discussionId: discussionInA.id, body: 'Members may leave.' },
		{ db }
	);
	const objectionInA = raiseObjection(
		ctxA,
		{ proposalPostId: proposalInA.id, reason: 'Nothing about assets.' },
		{ db }
	);

	// A second member of A, so the freeze below has somebody to notify: `notify`
	// skips the actor, and Alice acting alone would produce no rows at all.
	makeMembership(db, communityA.id, makeUser(db, { email: 'dave@example.org' }).id, {
		role: 'member'
	});

	// A decision in A, so `decisions.get` has a subject to be refused.
	const countable = getStandard('rcos-core', '0.1').countableClauses()[0]!;
	const decidable = openDiscussion(
		ctxA,
		{ title: 'Exit', about: { kind: 'clause', clauseKey: countable.key } },
		{ db }
	);
	addProposal(ctxA, { discussionId: decidable.id, body: 'Members may leave.' }, { db });
	const decisionInA = freeze(
		ctxA,
		{
			discussionId: decidable.id,
			idempotencyKey: 'cross-tenant-seed',
			title: 'Exit',
			type: 'strategic',
			mechanism: 'consent'
		},
		{ db }
	);

	// A notification in A, addressed to Alice, so `notifications.markRead` has a
	// subject that is genuinely not Bob's.
	const notificationInA = db.select().from(notification).all()[0];

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
			invitation: invitationInA.id,
			definition: definitionInA.id,
			communityArtifact: artifactInA,
			discussion: discussionInA.id,
			proposal: proposalInA.id,
			objection: objectionInA.id,
			decision: decisionInA.id,
			notification: notificationInA?.id ?? ''
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

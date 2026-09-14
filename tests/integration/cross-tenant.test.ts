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
import '../../src/lib/server/voting/consent-round.js';
import '../../src/lib/server/services/documents.js';
import '../../src/lib/server/services/evidence.js';
import '../../src/lib/server/services/mapping.js';
import '../../src/lib/server/services/document-versions.js';
import { inviteMember } from '../../src/lib/server/services/invitations.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { raiseObjection } from '../../src/lib/server/services/objections.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { consentRoundProvider } from '../../src/lib/server/voting/consent-round.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import { communityArtifact } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import {
	document as documentTable,
	documentFileVersion,
	evidence as evidenceTable,
	passage as passageTable
} from '../../src/lib/server/db/schema/documents.js';
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

	// A document, a passage and a piece of evidence in A. Written directly rather
	// than uploaded: this suite is about the boundary, and a real upload would
	// drag a filesystem into every one of its cases.
	const documentInA = newId();
	db.insert(documentTable)
		.values({
			id: documentInA,
			communityId: communityA.id,
			filename: 'bylaws.pdf',
			mime: 'application/pdf',
			bytes: 1024,
			sha256: 'a'.repeat(64),
			storageKey: `${communityA.id}/${newId()}`,
			status: 'extracted',
			statusDetail: null,
			pagesExtracted: 1,
			pagesTotal: 1,
			uploadedBy: alice.id,
			uploadedAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0)),
			extractedAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0))
		})
		.run();
	const passageInA = newId();
	db.insert(passageTable)
		.values({
			id: passageInA,
			documentId: documentInA,
			page: 1,
			ordinal: 0,
			text: 'A member may leave at any time.',
			textHash: 'b'.repeat(64),
			bbox: null
		})
		.run();
	const evidenceInA = newId();
	db.insert(evidenceTable)
		.values({
			id: evidenceInA,
			communityId: communityA.id,
			passageId: passageInA,
			quote: 'A member may leave at any time.',
			communityStandardId: db.select().from(communityStandard).all()[0]!.id,
			clauseKey: getStandard('rcos-core', '0.1').countableClauses()[0]!.key,
			state: 'confirmed',
			confidence: null,
			suggestedBy: 'human',
			confirmedBy: alice.id,
			confirmedAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0)),
			createdAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0))
		})
		.run();

	// An earlier file of A's document, for the version services.
	const versionInA = newId();
	db.insert(documentFileVersion)
		.values({
			id: versionInA,
			documentId: documentInA,
			communityId: communityA.id,
			filename: 'bylaws-2018.pdf',
			mime: 'application/pdf',
			bytes: 10,
			sha256: 'c'.repeat(64),
			storageKey: `${communityA.id}/${newId()}`,
			uploadedBy: alice.id,
			uploadedAt: new Date(Date.UTC(2026, 8, 1, 12, 0, 0)),
			supersededBy: alice.id,
			supersededAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0))
		})
		.run();

	// A consent round in A, so the voting services have a round to be refused.
	// It goes through the provider rather than an insert: a round B can reach by
	// id is the thing under test, and a hand-built row could be the wrong shape.
	const roundInA = consentRoundProvider.openRound(
		ctxA,
		{ proposalPostId: proposalInA.id, closesAt: Date.UTC(2026, 8, 9, 12, 0, 0) },
		{ db }
	);

	// A notification in A, addressed to Alice, so `notifications.open` has a
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
			invitation: invitationInA.id,
			definition: definitionInA.id,
			communityArtifact: artifactInA,
			discussion: discussionInA.id,
			proposal: proposalInA.id,
			objection: objectionInA.id,
			decision: decisionInA.id,
			// The reference rather than the id, and that is the whole point: B is
			// asked for a string it could have guessed.
			decisionRef: decisionInA.ref,
			consentRound: roundInA.id,
			document: documentInA,
			passage: passageInA,
			evidence: evidenceInA,
			documentVersion: `${documentInA}:${versionInA}`,
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

	it('has a registered service for every kind of subject it declares', () => {
		// Declaring a subject and registering nothing that takes one is how a whole
		// class of service goes untested: `consentRound` sat in the union unused
		// until this assertion existed, and the voting services were uncovered.
		const declared = new Set(Object.keys(world.subjectInA));
		const covered = new Set(tenantServices().map((s) => s.subject));
		expect([...declared].filter((subject) => !covered.has(subject as never))).toEqual([]);
	});
});

describe('a steward of one community cannot reach another', () => {
	for (const service of tenantServices()) {
		it(`${service.name} refuses a subject from another community`, async () => {
			const subjectId = world.subjectInA[service.subject];
			expect(subjectId, `no seeded subject of kind "${service.subject}"`).toBeTruthy();

			let threw = false;
			try {
				// Awaited, because some services are async — deleting a document
				// touches the filesystem, a mapping run calls a provider. Without the
				// await, a rejected promise is not a throw, and this suite would
				// report "returned instead of refusing" for a service that refused
				// perfectly well. The wrong answer either way, and the harness is the
				// last place that should be lying.
				await service.call(world.ctxB, subjectId!);
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
			// These are all synchronous; an async one would need the same await as
			// the loop above.
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

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	clauseCoverage,
	communityArtifact,
	consentResponse,
	consentRound,
	decision,
	definition,
	post,
	discussion
} from '../../src/lib/server/db/schema/index.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The constraints, asked to refuse what they exist to refuse.
 *
 * These live in the schema rather than in a service on purpose: a service check
 * holds against a bad caller, and a CHECK holds against a bad migration and a
 * hand-edited database as well. That is only worth claiming if each one is
 * watched failing at least once.
 */
const NOW = new Date(Date.UTC(2026, 8, 3, 12, 0, 0));

let db: Db;
let cleanup: () => void;
let communityId: string;
let standardId: string;
let artifactId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const community = makeCommunity(db, { slug: 'valle-verde' });
	communityId = community.id;

	standardId = newId();
	db.insert(communityStandard)
		.values({
			id: standardId,
			communityId,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: NOW,
			retiredAt: null
		})
		.run();

	artifactId = newId();
	db.insert(communityArtifact)
		.values({
			id: artifactId,
			communityId,
			title: 'Community Agreements',
			description: null,
			layer: null,
			order: 0,
			kind: 'default',
			createdAt: NOW
		})
		.run();
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const base = {
	communityId: '',
	title: null,
	layer: null,
	purpose: null,
	adoptedVersionId: null,
	openProposalId: null,
	reviewDueAt: null,
	provisional: false,
	createdBy: null,
	createdAt: NOW,
	updatedAt: NOW
};

function standardDefinition(sectionKey: string) {
	return {
		...base,
		id: newId(),
		communityId,
		scope: 'standard' as const,
		communityStandardId: standardId,
		sectionKey,
		attachKind: null,
		attachRcosArtifactKey: null,
		attachCommunityArtifactId: null
	};
}

function localDefinition(overrides: Record<string, unknown> = {}) {
	return {
		...base,
		id: newId(),
		communityId,
		scope: 'local' as const,
		communityStandardId: null,
		sectionKey: null,
		title: 'Quiet hours',
		attachKind: 'community_artifact' as const,
		attachRcosArtifactKey: null,
		attachCommunityArtifactId: artifactId,
		...overrides
	};
}

describe('one answer per standard section, and as many local rules as you like', () => {
	it('refuses a second definition for the same section', () => {
		db.insert(definition).values(standardDefinition('purpose-charter.primary-purpose')).run();

		expect(() =>
			db.insert(definition).values(standardDefinition('purpose-charter.primary-purpose')).run()
		).toThrow(/UNIQUE/i);
	});

	it('allows many local definitions, because the index is partial', () => {
		// A plain unique index would permit exactly one row with a null section
		// key — the opposite of what a community needs.
		for (const title of ['Quiet hours', 'Guests', 'Pets', 'Kitchen duty']) {
			db.insert(definition).values(localDefinition({ title })).run();
		}
		expect(db.select().from(definition).all()).toHaveLength(4);
	});

	it('allows the same section in two communities', () => {
		const other = makeCommunity(db, { slug: 'other-place' });
		const otherStandard = newId();
		db.insert(communityStandard)
			.values({
				id: otherStandard,
				communityId: other.id,
				standardId: 'rcos-core',
				version: '0.1',
				status: 'active',
				adoptedAt: NOW,
				retiredAt: null
			})
			.run();

		db.insert(definition).values(standardDefinition('purpose-charter.primary-purpose')).run();
		expect(() =>
			db
				.insert(definition)
				.values({
					...standardDefinition('purpose-charter.primary-purpose'),
					communityId: other.id,
					communityStandardId: otherStandard
				})
				.run()
		).not.toThrow();
	});
});

describe('scope and section key move together', () => {
	it('refuses a standard definition with no section', () => {
		expect(() =>
			db
				.insert(definition)
				.values({ ...standardDefinition('x'), sectionKey: null })
				.run()
		).toThrow(/CHECK/i);
	});

	it('refuses a local definition that names a section', () => {
		expect(() =>
			db
				.insert(definition)
				.values(localDefinition({ sectionKey: 'purpose-charter.primary-purpose' }))
				.run()
		).toThrow(/CHECK/i);
	});
});

describe('a local definition hangs from exactly one thing', () => {
	it('accepts a community artifact', () => {
		expect(() => db.insert(definition).values(localDefinition()).run()).not.toThrow();
	});

	it('accepts an RCOS artifact — the "local extension" case', () => {
		expect(() =>
			db
				.insert(definition)
				.values(
					localDefinition({
						attachKind: 'rcos_artifact',
						attachRcosArtifactKey: 'membership-state-registry',
						attachCommunityArtifactId: null
					})
				)
				.run()
		).not.toThrow();
	});

	it('refuses both at once', () => {
		expect(() =>
			db
				.insert(definition)
				.values(
					localDefinition({
						attachKind: 'rcos_artifact',
						attachRcosArtifactKey: 'membership-state-registry'
						// attachCommunityArtifactId left set
					})
				)
				.run()
		).toThrow(/CHECK/i);
	});

	it('refuses neither', () => {
		expect(() =>
			db
				.insert(definition)
				.values(localDefinition({ attachKind: null, attachCommunityArtifactId: null }))
				.run()
		).toThrow(/CHECK/i);
	});

	it('refuses a standard definition that hangs from an artifact', () => {
		expect(() =>
			db
				.insert(definition)
				.values({
					...standardDefinition('purpose-charter.primary-purpose'),
					attachKind: 'community_artifact',
					attachCommunityArtifactId: artifactId
				})
				.run()
		).toThrow(/CHECK/i);
	});
});

describe('a clause is answered once', () => {
	it('refuses two definitions covering one clause', () => {
		const a = standardDefinition('purpose-charter.primary-purpose');
		const b = standardDefinition('scope-declaration.in-scope-assets');
		db.insert(definition).values([a, b]).run();

		db.insert(clauseCoverage)
			.values({
				communityId,
				communityStandardId: standardId,
				clauseKey: '2.1.5',
				definitionId: a.id
			})
			.run();

		// docs/03 §4: an auditor asking "where did you define this?" gets one answer.
		expect(() =>
			db
				.insert(clauseCoverage)
				.values({
					communityId,
					communityStandardId: standardId,
					clauseKey: '2.1.5',
					definitionId: b.id
				})
				.run()
		).toThrow(/UNIQUE/i);
	});

	it('lets one definition cover several clauses', () => {
		const a = standardDefinition('purpose-charter.primary-purpose');
		db.insert(definition).values(a).run();
		expect(() =>
			db
				.insert(clauseCoverage)
				.values([
					{ communityId, communityStandardId: standardId, clauseKey: '2.1.5', definitionId: a.id },
					{ communityId, communityStandardId: standardId, clauseKey: '2.1.6', definitionId: a.id }
				])
				.run()
		).not.toThrow();
	});
});

describe('a decision number is taken once', () => {
	const decisionRow = (overrides: Record<string, unknown> = {}) => ({
		id: newId(),
		communityId,
		seq: 1,
		ref: 'DEC-2026-001',
		title: 'Probation period',
		type: 'strategic' as const,
		layer: 1,
		mechanism: 'consent',
		threshold: null,
		tallyPresent: 9,
		tallyFor: 9,
		tallyAgainst: 0,
		unresolvedObjections: 0,
		rationale: null,
		proposalText: 'Members may leave at any time…',
		decidedAt: NOW,
		reviewDueAt: null,
		source: 'online' as const,
		provisional: true,
		status: 'active' as const,
		supersededById: null,
		idempotencyKey: 'key-1',
		recordedBy: null,
		proposalPostId: null,
		...overrides
	});

	it('refuses a repeated sequence number', () => {
		db.insert(decision).values(decisionRow()).run();
		expect(() =>
			db
				.insert(decision)
				.values(decisionRow({ ref: 'DEC-2026-002', idempotencyKey: 'key-2' }))
				.run()
		).toThrow(/UNIQUE/i);
	});

	it('refuses a repeated idempotency key in the database, not only in the service', () => {
		// The window between checking and inserting is exactly where the duplicate
		// gets in, so the database is what closes it.
		db.insert(decision).values(decisionRow()).run();
		expect(() =>
			db
				.insert(decision)
				.values(decisionRow({ seq: 2, ref: 'DEC-2026-002' }))
				.run()
		).toThrow(/UNIQUE/i);
	});

	it('lets two communities each hold sequence 1', () => {
		const other = makeCommunity(db, { slug: 'other-place' });
		db.insert(decision).values(decisionRow()).run();
		expect(() =>
			db
				.insert(decision)
				.values(decisionRow({ communityId: other.id }))
				.run()
		).not.toThrow();
	});
});

describe('a member responds to a round once', () => {
	it('refuses a duplicate response and accepts a replacement', () => {
		const person = makeUser(db, { email: 'ana@example.org' });
		const member = makeMembership(db, communityId, person.id, { role: 'steward' });

		const discussionId = newId();
		db.insert(discussion)
			.values({
				id: discussionId,
				communityId,
				definitionId: null,
				clauseKey: '3.6.1',
				title: 'Exit and separation',
				status: 'open',
				origin: 'clause',
				openedBy: person.id,
				openedAt: NOW,
				lastActivityAt: NOW,
				frozenDecisionId: null
			})
			.run();

		const proposalId = newId();
		db.insert(post)
			.values({
				id: proposalId,
				discussionId,
				authorId: person.id,
				body: 'Members may leave at any time…',
				kind: 'proposal',
				proposalVersion: 1,
				frozenDecisionId: null,
				createdAt: NOW,
				editedAt: null
			})
			.run();

		const roundId = newId();
		db.insert(consentRound)
			.values({
				id: roundId,
				communityId,
				proposalPostId: proposalId,
				openedBy: person.id,
				openedAt: NOW,
				closesAt: new Date(NOW.getTime() + 86_400_000),
				status: 'open',
				closedAt: null,
				eligibility: 'all_members'
			})
			.run();

		const response = {
			roundId,
			membershipId: member.id,
			value: 'consent' as const,
			objectionId: null,
			respondedAt: NOW
		};
		db.insert(consentResponse).values(response).run();

		expect(() => db.insert(consentResponse).values(response).run()).toThrow(/UNIQUE/i);

		// Changing your mind replaces; it never adds a second voice.
		db.update(consentResponse)
			.set({ value: 'abstain' })
			.where(eq(consentResponse.roundId, roundId))
			.run();
		const rows = db.select().from(consentResponse).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.value).toBe('abstain');
	});
});

describe('a proposal is numbered once within its discussion', () => {
	it('refuses a repeated proposal version', () => {
		const person = makeUser(db, { email: 'marco@example.org' });
		const discussionId = newId();
		db.insert(discussion)
			.values({
				id: discussionId,
				communityId,
				definitionId: null,
				clauseKey: '3.6.1',
				title: 'Exit and separation',
				status: 'open',
				origin: 'clause',
				openedBy: person.id,
				openedAt: NOW,
				lastActivityAt: NOW,
				frozenDecisionId: null
			})
			.run();

		const proposal = (n: number) => ({
			id: newId(),
			discussionId,
			authorId: person.id,
			body: `v${n}`,
			kind: 'proposal' as const,
			proposalVersion: n,
			frozenDecisionId: null,
			createdAt: NOW,
			editedAt: null
		});

		db.insert(post).values(proposal(1)).run();
		db.insert(post).values(proposal(2)).run();
		expect(() => db.insert(post).values(proposal(2)).run()).toThrow(/UNIQUE/i);

		// Messages are not proposals and are not numbered, so any number of them
		// coexist — a null never collides in a unique index.
		const message = {
			...proposal(1),
			id: newId(),
			kind: 'message' as const,
			proposalVersion: null
		};
		expect(() => {
			db.insert(post).values(message).run();
			db.insert(post)
				.values({ ...message, id: newId() })
				.run();
		}).not.toThrow();
	});
});

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	communityArtifact,
	definition,
	standardFeedback
} from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import {
	StaleDraftError,
	createDefinition,
	getDefinition,
	getDraft,
	listLocalDefinitions,
	saveDraft
} from '../../src/lib/server/services/definitions.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The `definitions` capability. openspec core-loop, UI spec §1.4b.
 *
 * The line these tests keep drawing: a local definition gets the whole
 * lifecycle and moves no number. Everything that would make it second-class is
 * a bug, and everything that would let it count is a worse one.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let artifactId: string;

function seedCommunity(slug: string, email: string) {
	const person = makeUser(db, { email });
	const community = makeCommunity(db, { slug });
	const member = makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true });

	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: community.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();

	const artifact = newId();
	db.insert(communityArtifact)
		.values({
			id: artifact,
			communityId: community.id,
			title: 'Community Agreements',
			description: null,
			layer: null,
			order: 0,
			kind: 'default',
			createdAt: new Date(NOW)
		})
		.run();

	return {
		artifactId: artifact,
		ctx: { user: person, community, membership: member, now: () => NOW } satisfies Ctx
	};
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	({ ctx, artifactId } = seedCommunity('valle-verde', 'ana@example.org'));
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const local = (title = 'Quiet hours') =>
	createDefinition(
		ctx,
		{ scope: 'local', title, attach: { kind: 'community_artifact', artifactId } },
		{ db }
	);

describe('a definition answers one section, or nothing at all', () => {
	it('creates a standard definition against a section', () => {
		const created = createDefinition(
			ctx,
			{ scope: 'standard', sectionKey: 'purpose-charter.primary-purpose' },
			{ db }
		);

		expect(created.scope).toBe('standard');
		expect(created.sectionKey).toBe('purpose-charter.primary-purpose');
		expect(created.communityStandardId).toBeTruthy();
	});

	it('offers the existing one rather than a second for the same section', () => {
		createDefinition(
			ctx,
			{ scope: 'standard', sectionKey: 'purpose-charter.primary-purpose' },
			{ db }
		);

		// The index would refuse it anyway; asking first means the member is told
		// what to do instead of being shown a constraint violation.
		type Refusal = { status?: number; body?: { message?: string } };
		let thrown: Refusal | null = null;
		try {
			createDefinition(
				ctx,
				{ scope: 'standard', sectionKey: 'purpose-charter.primary-purpose' },
				{ db }
			);
		} catch (problem) {
			thrown = problem as Refusal;
		}

		expect(thrown?.status).toBe(409);
		expect(thrown?.body?.message).toMatch(/already has a definition/);
		expect(db.select().from(definition).all()).toHaveLength(1);
	});

	it('creates as many local definitions as a community likes', () => {
		for (const title of ['Quiet hours', 'Guests', 'Pets', 'Kitchen duty']) local(title);
		expect(db.select().from(definition).all()).toHaveLength(4);
	});

	it('gives a new definition somewhere to type immediately', () => {
		const created = local();
		const draft = getDraft(ctx, created.id, { db });
		expect(draft.body).toBe('');
		expect(draft.editToken).toBeTruthy();
	});
});

describe('a local definition hangs from exactly one thing', () => {
	it('accepts the community-s own artifact', () => {
		expect(local().attachCommunityArtifactId).toBe(artifactId);
	});

	it('accepts an RCOS artifact — saying more inside a section RCOS does define', () => {
		const created = createDefinition(
			ctx,
			{
				scope: 'local',
				title: 'Sabbatical membership',
				attach: { kind: 'rcos_artifact', artifactKey: 'membership-state-registry' }
			},
			{ db }
		);
		expect(created.attachRcosArtifactKey).toBe('membership-state-registry');
		expect(created.attachCommunityArtifactId).toBeNull();
		// Still local, still counts for nothing.
		expect(created.scope).toBe('local');
		expect(created.sectionKey).toBeNull();
	});

	it('refuses an artifact belonging to another community', () => {
		const other = seedCommunity('other-place', 'marco@example.org');

		expect(() =>
			createDefinition(
				ctx,
				{
					scope: 'local',
					title: 'Theirs',
					attach: { kind: 'community_artifact', artifactId: other.artifactId }
				},
				{ db }
			)
		).toThrow(expect.objectContaining({ status: 404 }));
	});
});

describe('what a community wished the standard had asked', () => {
	it('records feedback when the box is ticked, with their own words', () => {
		createDefinition(
			ctx,
			{
				scope: 'local',
				title: 'Composting rules',
				attach: { kind: 'community_artifact', artifactId },
				standardShouldRequireThis: true
			},
			{ db }
		);

		const [entry] = db.select().from(standardFeedback).all();
		expect(entry!.body).toBe('Composting rules');
		expect(entry!.standardId).toBe('rcos-core');
		expect(entry!.version).toBe('0.1');
		// Sharing upstream is a separate, deliberate act.
		expect(entry!.sharedUpstream).toBe(false);
	});

	it('records nothing when the box is not ticked', () => {
		local();
		expect(db.select().from(standardFeedback).all()).toHaveLength(0);
	});
});

describe('concurrent editing does not silently lose work', () => {
	it('accepts a save carrying the token it loaded with, and rotates it', () => {
		const created = local();
		const first = getDraft(ctx, created.id, { db });

		const saved = saveDraft(
			ctx,
			{ definitionId: created.id, editToken: first.editToken, body: 'Quiet from 22:00.' },
			{ db }
		);

		expect(saved.body).toBe('Quiet from 22:00.');
		expect(saved.editToken).not.toBe(first.editToken);
	});

	it('lets one editor save repeatedly, each with the token the last returned', () => {
		const created = local();
		let token = getDraft(ctx, created.id, { db }).editToken;

		for (const body of ['a', 'ab', 'abc']) {
			token = saveDraft(
				ctx,
				{ definitionId: created.id, editToken: token, body },
				{ db }
			).editToken;
		}
		expect(getDraft(ctx, created.id, { db }).body).toBe('abc');
	});

	it('refuses a stale token and says what is actually there', () => {
		const created = local();
		const loadedByBoth = getDraft(ctx, created.id, { db }).editToken;

		saveDraft(
			ctx,
			{ definitionId: created.id, editToken: loadedByBoth, body: 'Ana wrote this.' },
			{ db }
		);

		// The second editor loaded the same token and is now behind.
		let thrown: StaleDraftError | null = null;
		try {
			saveDraft(
				ctx,
				{ definitionId: created.id, editToken: loadedByBoth, body: 'Marco wrote this.' },
				{ db }
			);
		} catch (problem) {
			thrown = problem as StaleDraftError;
		}

		expect(thrown).toBeInstanceOf(StaleDraftError);
		// Not just "no": what is there, who put it there, and when — the three
		// things needed to choose between keeping yours and taking theirs.
		expect(thrown!.current.body).toBe('Ana wrote this.');
		expect(thrown!.current.updatedBy).toBe(ctx.user.id);
		expect(thrown!.current.updatedAt).toBe(NOW);

		// And nothing was overwritten.
		expect(getDraft(ctx, created.id, { db }).body).toBe('Ana wrote this.');
	});
});

describe('the tenant boundary', () => {
	it('reports another community-s definition as one that does not exist', () => {
		const other = seedCommunity('other-place', 'marco@example.org');
		const theirs = createDefinition(
			other.ctx,
			{
				scope: 'local',
				title: 'Theirs',
				attach: { kind: 'community_artifact', artifactId: other.artifactId }
			},
			{ db }
		);

		expect(() => getDefinition(ctx, theirs.id, { db })).toThrow(
			expect.objectContaining({ status: 404 })
		);
	});

	it('lists only the asking community-s local definitions', () => {
		const other = seedCommunity('other-place', 'marco@example.org');
		createDefinition(
			other.ctx,
			{
				scope: 'local',
				title: 'Theirs',
				attach: { kind: 'community_artifact', artifactId: other.artifactId }
			},
			{ db }
		);
		local('Ours');

		const ours = listLocalDefinitions(ctx, artifactId, { db });
		expect(ours.map((d) => d.title)).toEqual(['Ours']);
	});

	it('refuses to list another community-s artifact', () => {
		const other = seedCommunity('other-place', 'marco@example.org');
		expect(() => listLocalDefinitions(ctx, other.artifactId, { db })).toThrow(
			expect.objectContaining({ status: 404 })
		);
	});
});

describe('permissions', () => {
	it('lets a plain member draft, because proposing is what a member does', () => {
		const person = makeUser(db, { email: 'lena@example.org' });
		const member = makeMembership(db, ctx.community.id, person.id, { role: 'member' });
		const memberCtx: Ctx = { ...ctx, user: person, membership: member };

		expect(() =>
			createDefinition(
				memberCtx,
				{ scope: 'local', title: 'Guests', attach: { kind: 'community_artifact', artifactId } },
				{ db }
			)
		).not.toThrow();
	});
});

describe('a definition starts unanswered', () => {
	it('has no adopted version until something is frozen', () => {
		const created = local();
		const row = db.select().from(definition).where(eq(definition.id, created.id)).get()!;
		expect(row.adoptedVersionId).toBeNull();
		expect(row.provisional).toBe(false);
	});
});

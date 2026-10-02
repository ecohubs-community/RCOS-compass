import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, localDefinitionTouch } from '../../src/lib/server/db/schema/definitions.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import { evidence } from '../../src/lib/server/db/schema/documents.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import {
	addMessage,
	addProposal,
	openDiscussion
} from '../../src/lib/server/services/discussions.js';
import {
	definitionVersions,
	discussionsForDefinition,
	evidenceForDefinition,
	localDefinitionContext,
	relatedDefinitions,
	statusesBySection
} from '../../src/lib/server/services/provenance.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The reads behind "How we got here" (`provenance-ui` group 2). Each through
 * the real freeze, so a version and its decision are what a community would
 * actually have.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const VOLUNTARY = 'exit-protocol.voluntary-exit';
const FORCED = 'exit-protocol.forced-exit';
const NON_GOALS = 'purpose-charter.non-goals-and-exclusions';

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let memberCtx: Ctx;

function seedCommunity(slug: string) {
	const community = makeCommunity(db, { slug });
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
	const person = makeUser(db, { email: `steward-${slug}@example.org` });
	const seat = makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true });
	return { user: person, community, membership: seat, now: () => NOW } as Ctx;
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ctx = seedCommunity('valle-verde');
	const person = makeUser(db, { email: 'lena@example.org', name: 'Lena' });
	const seat = makeMembership(db, ctx.community.id, person.id, { role: 'member' });
	memberCtx = { ...ctx, user: person, membership: seat };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

let key = 0;
function frozenThread(about: Parameters<typeof openDiscussion>[1]['about'], body = 'Rule text.') {
	const thread = openDiscussion(ctx, { title: 'Thread', about }, { db });
	addProposal(ctx, { discussionId: thread.id, body }, { db });
	freeze(
		ctx,
		{
			discussionId: thread.id,
			idempotencyKey: `k-${(key += 1)}`,
			title: 'Decided',
			type: 'strategic',
			mechanism: 'consent',
			tallyPresent: 9,
			tallyFor: 9,
			tallyAgainst: 0
		} as Parameters<typeof freeze>[1],
		{ db }
	);
	return thread;
}
const definitionFor = (sectionKey: string) =>
	db.select().from(definition).where(eq(definition.sectionKey, sectionKey)).get()!;

describe('discussions about a definition', () => {
	it('finds a thread opened on a clause before the definition existed', () => {
		const thread = frozenThread({ kind: 'clause', clauseKey: '3.6.2' });
		const found = discussionsForDefinition(memberCtx, definitionFor(VOLUNTARY).id, { db });
		expect(found.map((d) => d.id)).toEqual([thread.id]);
	});

	it('finds a thread started from the Path on a section that owns no clause', () => {
		const thread = frozenThread({ kind: 'section', sectionKey: NON_GOALS });
		expect(
			discussionsForDefinition(ctx, definitionFor(NON_GOALS).id, { db }).map((d) => d.id)
		).toEqual([thread.id]);
	});

	it('lists a thread linked both ways once, and counts its messages', () => {
		const first = frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		const id = definitionFor(VOLUNTARY).id;
		const second = openDiscussion(
			ctx,
			{ title: 'Revisit', about: { kind: 'definition', definitionId: id } },
			{ db }
		);
		addMessage(ctx, { discussionId: second.id, body: 'One.' }, { db });
		addMessage(ctx, { discussionId: second.id, body: 'Two.' }, { db });
		const found = discussionsForDefinition(ctx, id, { db });
		expect(found.map((d) => d.id).sort()).toEqual([first.id, second.id].sort());
		expect(found.find((d) => d.id === second.id)!.messages).toBe(2);
	});

	it('does not list a thread on another section that only cites one of its clauses', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		openDiscussion(
			ctx,
			{ title: 'Forced', about: { kind: 'section', sectionKey: FORCED, clauseKey: '3.6.3' } },
			{ db }
		);
		const found = discussionsForDefinition(ctx, definitionFor(VOLUNTARY).id, { db });
		expect(found).toHaveLength(1);
	});

	it('is not found from another community', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		const other = seedCommunity('rio-claro');
		const refusal = catchRefusal(() =>
			discussionsForDefinition(other, definitionFor(VOLUNTARY).id, { db })
		);
		expect(refusal?.status).toBe(404);
	});
});

describe('versions and their decisions', () => {
	it('lists every adopted version newest first, the latest marked current', () => {
		const thread = frozenThread({ kind: 'clause', clauseKey: '3.6.1' }, 'v1 text');
		addProposal(ctx, { discussionId: thread.id, body: 'v2 text' }, { db });
		freeze(
			ctx,
			{
				discussionId: thread.id,
				idempotencyKey: 'second',
				title: 'Again',
				type: 'strategic',
				mechanism: 'vote',
				tallyPresent: 7,
				tallyFor: 5,
				tallyAgainst: 2
			} as Parameters<typeof freeze>[1],
			{ db }
		);
		const versions = definitionVersions(memberCtx, definitionFor(VOLUNTARY).id, { db });
		expect(versions.map((v) => [v.n, v.current])).toEqual([
			[2, true],
			[1, false]
		]);
		expect(versions[0]!.decision).toMatchObject({
			mechanism: 'vote',
			tallyFor: 5,
			tallyAgainst: 2,
			ref: expect.stringMatching(/^DEC-2026-002$/)
		});
		expect(versions[1]!.decision!.ref).toBe('DEC-2026-001');
	});

	it('is empty for a definition never adopted', () => {
		openDiscussion(ctx, { title: 'T', about: { kind: 'clause', clauseKey: '3.6.1' } }, { db });
		const draft = db
			.insert(definition)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				scope: 'local',
				title: 'Quiet hours',
				layer: 5,
				attachKind: 'rcos_artifact',
				attachRcosArtifactKey: 'meeting-templates',
				provisional: false,
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW)
			})
			.returning()
			.get();
		expect(definitionVersions(ctx, draft.id, { db })).toEqual([]);
	});
});

describe('related definitions', () => {
	it('come from the standard, resolved to what this community wrote', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		frozenThread({ kind: 'clause', clauseKey: '3.6.3' });
		const related = relatedDefinitions(ctx, definitionFor(VOLUNTARY).id, { db });
		const forced = related.find((r) => r.sectionKey === FORCED)!;
		expect(forced).toMatchObject({ adopted: true, why: 'cites' });
		expect(forced.definitionId).toBe(definitionFor(FORCED).id);
		const separation = related.find(
			(r) => r.sectionKey === 'exit-protocol.asset-role-and-responsibility-separation'
		);
		expect(separation).toMatchObject({ definitionId: null, why: 'depends', ref: '3.6.5' });
	});

	it('hide a restricted definition from a member and show it to a steward', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		frozenThread({ kind: 'clause', clauseKey: '3.6.3' });
		db.update(definition)
			.set({ visibility: 'restricted' })
			.where(eq(definition.sectionKey, FORCED))
			.run();
		const id = definitionFor(VOLUNTARY).id;
		const forMember = relatedDefinitions(memberCtx, id, { db }).find(
			(r) => r.sectionKey === FORCED
		)!;
		expect(forMember.definitionId).toBeNull();
		const forSteward = relatedDefinitions(ctx, id, { db }).find((r) => r.sectionKey === FORCED)!;
		expect(forSteward.definitionId).not.toBeNull();
	});
});

describe('derived status for many sections', () => {
	it('reads in-discussion, in-vote-free adoption and drafting from one pass', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		openDiscussion(
			ctx,
			{ title: 'Forced', about: { kind: 'section', sectionKey: FORCED, clauseKey: '3.6.3' } },
			{ db }
		);
		const statuses = statusesBySection(ctx, { db });
		expect(statuses.get(VOLUNTARY)).toMatchObject({ status: 'adopted', rediscussed: false });
		expect(statuses.get(FORCED)).toMatchObject({ status: 'in_discussion', definitionId: null });
		expect(statuses.has(NON_GOALS)).toBe(false);
	});

	it('keeps an adopted definition adopted while it is argued again', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		openDiscussion(
			ctx,
			{
				title: 'Change it',
				about: { kind: 'definition', definitionId: definitionFor(VOLUNTARY).id }
			},
			{ db }
		);
		expect(statusesBySection(ctx, { db }).get(VOLUNTARY)).toMatchObject({
			status: 'adopted',
			rediscussed: true
		});
	});
});

describe('evidence for a definition', () => {
	function evidenceRow(
		clauseKey: string,
		state: 'confirmed' | 'suggested' | 'stale',
		quote: string
	) {
		const standardId = db
			.select()
			.from(communityStandard)
			.where(eq(communityStandard.communityId, ctx.community.id))
			.get()!.id;
		db.insert(evidence)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				passageId: null,
				quote,
				communityStandardId: standardId,
				clauseKey,
				state,
				confidence: null,
				suggestedBy: 'human',
				confirmedBy: state === 'suggested' ? null : ctx.user.id,
				confirmedAt: state === 'suggested' ? null : new Date(NOW),
				createdAt: new Date(NOW)
			})
			.run();
	}

	it('is the confirmed evidence for the clauses its section owns, nothing stale or suggested', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		evidenceRow('l1.exit-and-separation.2', 'confirmed', 'Leaving is never punished.');
		evidenceRow('l1.exit-and-separation.1', 'stale', 'An old line.');
		evidenceRow('l1.exit-and-separation.4', 'suggested', 'A guess.');
		evidenceRow('l1.exit-and-separation.3', 'confirmed', 'About forced exit.');
		expect(evidenceForDefinition(memberCtx, definitionFor(VOLUNTARY).id, { db })).toEqual([
			expect.objectContaining({ quote: 'Leaving is never punished.', clauseRef: '3.6.2' })
		]);
	});
});

describe('a local definition', () => {
	function quietHours() {
		return createDefinition(
			memberCtx,
			{
				scope: 'local',
				title: 'Quiet hours',
				purpose: 'People sleep here.',
				layer: 1,
				attach: { kind: 'rcos_artifact', artifactKey: 'membership-agreement' }
			},
			{ db }
		);
	}

	it('says why it exists, who asked, what it touches and what is adopted beside it', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		const local = quietHours();
		db.insert(localDefinitionTouch)
			.values({ definitionId: local.id, clauseKey: 'l1.rights-and-obligations.1' })
			.run();
		const context = localDefinitionContext(ctx, local.id, { db })!;
		expect(context).toMatchObject({
			purpose: 'People sleep here.',
			askedBy: 'Lena',
			writtenDown: null,
			internal: true
		});
		expect(context.sameLayer.map((d) => d.title)).toEqual(['Voluntary Exit']);
		expect(context.touches).toEqual([{ ref: '3.4.1', owned: false }]);
	});

	it('is nothing for a definition that answers the standard', () => {
		frozenThread({ kind: 'clause', clauseKey: '3.6.1' });
		expect(localDefinitionContext(ctx, definitionFor(VOLUNTARY).id, { db })).toBeNull();
	});

	it('can be discussed and frozen into its own first version', () => {
		const local = quietHours();
		const thread = frozenThread(
			{ kind: 'definition', definitionId: local.id },
			'Quiet after 22:00.'
		);
		const versions = definitionVersions(ctx, local.id, { db });
		expect(versions).toHaveLength(1);
		expect(versions[0]!.current).toBe(true);
		expect(discussionsForDefinition(ctx, local.id, { db }).map((d) => d.id)).toEqual([thread.id]);
		expect(localDefinitionContext(ctx, local.id, { db })!.writtenDown).toBe(NOW);
		// It moved no number: no standard definition was created.
		expect(
			db
				.select()
				.from(definition)
				.all()
				.filter((row) => row.scope === 'standard')
		).toHaveLength(0);
	});
});

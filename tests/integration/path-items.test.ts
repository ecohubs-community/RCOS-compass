import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition } from '../../src/lib/server/db/schema/definitions.js';
import { decisionClause } from '../../src/lib/server/db/schema/decisions.js';
import { discussion } from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import {
	addProposal,
	getDiscussion,
	openDiscussion,
	threadRequirement
} from '../../src/lib/server/services/discussions.js';
import { path } from '../../src/lib/server/services/path.js';
import { readiness } from '../../src/lib/server/services/readiness.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The `path-items` capability: a Path item is a section, and everything it
 * starts has to land on that section.
 *
 * Before this, a thread was filed under the section's first countable clause and
 * found its way back through `clause.owner`. That left the 28 sections owning
 * no countable clause with nothing to start, and a thread filed under a clause a
 * section only references froze into the clause's owner instead.
 */
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');

const VOLUNTARY = 'exit-protocol.voluntary-exit';
const FORCED = 'exit-protocol.forced-exit';
const SEPARATION = 'exit-protocol.asset-role-and-responsibility-separation';
const NON_GOALS = 'purpose-charter.non-goals-and-exclusions';
const PRIMARY = 'purpose-charter.primary-purpose';
const keyOf = (ref: string) => view.clauseByRef(ref)!.key;

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
	const person = makeUser(db, { email: 'lena@example.org' });
	const seat = makeMembership(db, ctx.community.id, person.id, { role: 'member' });
	memberCtx = { ...ctx, user: person, membership: seat };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const item = (key: string, who: Ctx = ctx) =>
	path({ ...who }, { db }).find((entry) => entry.sectionKey === key);

let keyCounter = 0;
function freezeWith(who: Ctx, discussionId: string) {
	addProposal(who, { discussionId, body: 'What we decided.' }, { db });
	return freeze(
		who,
		{
			discussionId,
			idempotencyKey: `key-${(keyCounter += 1)}`,
			title: 'Decided',
			type: 'strategic',
			mechanism: 'consent',
			tallyPresent: 5,
			tallyFor: 5,
			tallyAgainst: 0
		} as Parameters<typeof freeze>[1],
		{ db }
	);
}

describe('what a Path item cites', () => {
	it('cites every clause its section owns, before the ones it only references', () => {
		expect(item(VOLUNTARY)!.cites).toEqual([
			{ key: keyOf('3.6.1'), ref: '3.6.1', owned: true },
			{ key: keyOf('3.6.2'), ref: '3.6.2', owned: true },
			{ key: keyOf('3.6.4'), ref: '3.6.4', owned: true }
		]);
		// Forced exit relies on §3.6.4 without answering it.
		expect(item(FORCED)!.cites).toEqual([
			{ key: keyOf('3.6.3'), ref: '3.6.3', owned: true },
			{ key: keyOf('3.6.4'), ref: '3.6.4', owned: false }
		]);
	});

	it('cites what a section owning no countable clause relies on, as related', () => {
		expect(item(NON_GOALS)!.cites).toEqual([{ key: keyOf('2.1.5'), ref: '2.1.5', owned: false }]);
	});

	it('gives every one of the 94 items somewhere to start', () => {
		const all = path(ctx, { db });
		expect(all).toHaveLength(view.meta.counts?.authoredSections ?? 94);
		for (const entry of all) expect(entry.start.sectionKey).toBe(entry.sectionKey);
		// The 28 that used to fall through to a blank form.
		expect(all.filter((entry) => entry.start.clauseKey === null)).toHaveLength(28);
		expect(item(VOLUNTARY)!.start).toEqual({ sectionKey: VOLUNTARY, clauseKey: keyOf('3.6.1') });
	});
});

describe('starting a discussion on a section', () => {
	it('files it against the section, and the first owned clause when there is one', () => {
		const thread = openDiscussion(
			memberCtx,
			{
				title: 'Leaving',
				about: { kind: 'section', sectionKey: VOLUNTARY, clauseKey: keyOf('3.6.1') }
			},
			{ db }
		);
		expect(thread.sectionKey).toBe(VOLUNTARY);
		expect(thread.clauseKey).toBe(keyOf('3.6.1'));
	});

	it('accepts the reference members read instead of the key', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Leaving', about: { kind: 'section', sectionKey: VOLUNTARY, clauseKey: '3.6.2' } },
			{ db }
		);
		expect(thread.clauseKey).toBe(keyOf('3.6.2'));
		expect(thread.sectionKey).toBe(VOLUNTARY);
	});

	it('files a section that owns no clause against the section alone', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Not us', about: { kind: 'section', sectionKey: NON_GOALS, clauseKey: null } },
			{ db }
		);
		expect(thread.sectionKey).toBe(NON_GOALS);
		expect(thread.clauseKey).toBeNull();
	});

	it('lets the clause decide when a member replaces it with another section’s', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Leaving', about: { kind: 'section', sectionKey: VOLUNTARY, clauseKey: '3.6.5' } },
			{ db }
		);
		expect(thread.clauseKey).toBe(keyOf('3.6.5'));
		expect(thread.sectionKey).toBeNull();
	});

	it('refuses a section the community does not write, or that does not exist', () => {
		for (const sectionKey of ['purpose-charter.ratification-record', 'nothing.like-this']) {
			const refusal = catchRefusal(() =>
				openDiscussion(ctx, { title: 'X', about: { kind: 'section', sectionKey } }, { db })
			);
			expect(refusal?.status).toBe(400);
		}
		expect(db.select().from(discussion).all()).toHaveLength(0);
	});

	it('refuses a clause the standard does not have', () => {
		const refusal = catchRefusal(() =>
			openDiscussion(
				ctx,
				{ title: 'X', about: { kind: 'section', sectionKey: VOLUNTARY, clauseKey: '9.9.9' } },
				{ db }
			)
		);
		expect(refusal?.status).toBe(400);
	});

	it('refuses someone without the right to start discussions', () => {
		const observer = { ...ctx, membership: { ...ctx.membership, role: 'observer' as never } };
		const refusal = catchRefusal(() =>
			openDiscussion(
				observer,
				{ title: 'X', about: { kind: 'section', sectionKey: NON_GOALS } },
				{ db }
			)
		);
		expect(refusal?.status).toBe(403);
	});

	it('is not reachable from another community', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Not us', about: { kind: 'section', sectionKey: NON_GOALS } },
			{ db }
		);
		const other = seedCommunity('rio-claro');
		expect(catchRefusal(() => getDiscussion(other, thread.id, { db }))?.status).toBe(404);
		expect(item(NON_GOALS, other)!.discussionId).toBeNull();
	});
});

describe('freezing a section that owns no countable clause', () => {
	it('adopts that section, not the owner of a clause it relies on, and moves no readiness', () => {
		const before = readiness({ ...ctx }, { db })!;
		const thread = openDiscussion(
			ctx,
			{ title: 'Not us', about: { kind: 'section', sectionKey: NON_GOALS } },
			{ db }
		);
		const recorded = freezeWith(ctx, thread.id);

		const adopted = db.select().from(definition).all();
		expect(adopted).toHaveLength(1);
		expect(adopted[0]!.sectionKey).toBe(NON_GOALS);
		expect(adopted[0]!.adoptedVersionId).not.toBeNull();
		expect(adopted[0]!.layer).toBe(0);
		expect(
			db.select().from(decisionClause).where(eq(decisionClause.decisionId, recorded.id)).all()
		).toHaveLength(0);

		expect(item(NON_GOALS)).toBeUndefined();
		expect(item(PRIMARY)).toBeDefined();
		expect(readiness({ ...ctx }, { db })!.satisfied).toBe(before.satisfied);
	});

	it('covers every clause a section owns when it has some', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Leaving', about: { kind: 'section', sectionKey: VOLUNTARY, clauseKey: '3.6.1' } },
			{ db }
		);
		const recorded = freezeWith(ctx, thread.id);
		const refs = db
			.select()
			.from(decisionClause)
			.where(eq(decisionClause.decisionId, recorded.id))
			.all()
			.map((row) => row.ref)
			.sort();
		expect(refs).toEqual(['3.6.1', '3.6.2', '3.6.4']);
	});

	it('still resolves a thread opened before sections were named, through its clause', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Leaving', about: { kind: 'clause', clauseKey: keyOf('3.6.2') } },
			{ db }
		);
		expect(thread.sectionKey).toBeNull();
		freezeWith(ctx, thread.id);
		expect(db.select().from(definition).all()[0]!.sectionKey).toBe(VOLUNTARY);
	});
});

describe('which item an open discussion belongs to', () => {
	it('is the section it answers, never a section that only cites the same clause', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Leaving', about: { kind: 'section', sectionKey: VOLUNTARY, clauseKey: '3.6.1' } },
			{ db }
		);
		expect(item(VOLUNTARY)!.discussionId).toBe(thread.id);
		// Forced exit cites §3.6.4 too; this thread is not its.
		expect(item(FORCED)!.discussionId).toBeNull();
	});

	it('is found for a section that owns no clause', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Not us', about: { kind: 'section', sectionKey: NON_GOALS } },
			{ db }
		);
		expect(item(NON_GOALS)!.discussionId).toBe(thread.id);
		expect(item(PRIMARY)!.discussionId).toBeNull();
	});

	it('includes a thread opened on a clause alone, through its owner', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Leaving', about: { kind: 'clause', clauseKey: '3.6.2' } },
			{ db }
		);
		expect(item(VOLUNTARY)!.discussionId).toBe(thread.id);
	});
});

describe('the RCOS text a thread shows', () => {
	it('is the section it answers, with what the standard assigns elsewhere', () => {
		const thread = openDiscussion(
			memberCtx,
			{ title: 'Leaving', about: { kind: 'section', sectionKey: VOLUNTARY, clauseKey: '3.6.1' } },
			{ db }
		);
		const shown = threadRequirement(memberCtx, thread, { db })!;
		expect(shown.sectionKey).toBe(VOLUNTARY);
		expect(shown.clauses.map((c) => c.ref)).toEqual(['3.6.1', '3.6.2', '3.6.4']);
		expect(shown.notHere.map((s) => s.sectionKey)).toEqual([
			FORCED,
			'exit-protocol.suspension',
			SEPARATION
		]);
	});

	it('is nothing for a thread about nothing in the standard', () => {
		const thread = openDiscussion(
			ctx,
			{ title: 'Dinner rota', about: { kind: 'open_question' } },
			{ db }
		);
		expect(threadRequirement(ctx, thread, { db })).toBeNull();
	});
});

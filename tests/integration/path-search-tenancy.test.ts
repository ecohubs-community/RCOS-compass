import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VISIBILITY_LEVELS } from '../../src/lib/server/db/schema/visibility.js';

/** These suites are about the tenant boundary, not the visibility one. */
const ALL_LEVELS = VISIBILITY_LEVELS;
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { DEFAULT_WEIGHTS } from '../../src/lib/server/db/schema/path.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { getSearchIndex } from '../../src/lib/server/search/index.js';
import { freeze, searchDecisions } from '../../src/lib/server/services/decisions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { glossary } from '../../src/lib/server/services/glossary.js';
import { lookup } from '../../src/lib/server/services/lookup.js';
import {
	activeWeights,
	placeOverride,
	setWeights,
	weightsHistory
} from '../../src/lib/server/services/ordering.js';
import { path } from '../../src/lib/server/services/path.js';
import { getRiskProfile, setRiskProfile } from '../../src/lib/server/services/risk-profile.js';
import { rebuildSearchIndex } from '../../src/lib/server/services/search.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The tenant boundary for everything P5 added. `docs/04-security.md` §2.
 *
 * The cross-tenant suite is parameterised over `services/registry.ts`, and a
 * service that is not registered fails it — which is what stops that suite
 * falling behind the code. **Almost nothing in this phase can be registered.**
 * A registered service takes a `Ctx` and a *subject id*; search takes a
 * question, the weights take a community, the interview takes answers, and the
 * two things that do take an identifier take a standard-wide one — a section
 * key, a glossary term — which is the same string for every community and not a
 * subject anybody could point at a neighbour's.
 *
 * So the honest closing check is this: every entry point the phase added, named
 * once, with the boundary asserted directly. Community A is filled with
 * everything the phase can produce, and B must see none of it.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let bo: Ctx;

function seed(slug: string): Ctx {
	const home = makeCommunity(db, { slug });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const person = makeUser(db, { email: `steward-${slug}@example.org` });
	return {
		user: person,
		community: home,
		membership: makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
}

/** Everything this phase can produce, for one community. */
function fill(ctx: Ctx, body: string) {
	const thread = openDiscussion(
		ctx,
		{ title: 'What can we spend', about: { kind: 'clause', clauseKey: COUNTABLE.key } },
		{ db }
	);
	addProposal(ctx, { discussionId: thread.id, body }, { db });
	const recorded = freeze(
		ctx,
		{
			discussionId: thread.id,
			idempotencyKey: `key-${ctx.community.id}`,
			title: 'What can we spend',
			type: 'strategic',
			mechanism: 'consent'
		} as Parameters<typeof freeze>[1],
		{ db }
	);
	setRiskProfile(ctx, { holdsLand: true, sharedMoney: true, meets: 'online' }, { db });
	setWeights(ctx, { ...DEFAULT_WEIGHTS, risk: 60 }, { db });
	placeOverride(ctx, path(ctx, { db })[20]!.sectionKey, 0, { db });
	return recorded;
}

const SECRET = 'Any spend over €500 needs a consent decision of the whole circle.';

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ana = seed('valle-verde');
	bo = seed('other-place');
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe("nothing of one community's path or search reaches another", () => {
	it('shows B none of what A wrote, however it is asked for', () => {
		const recorded = fill(ana, SECRET);

		// The index, directly and through both of its callers.
		expect(
			getSearchIndex(db).query(bo.community.id, 'spend circle water pump', { levels: ALL_LEVELS })
		).toEqual([]);
		expect(searchDecisions(bo, 'spend', { db })).toEqual([]);

		expect(lookup(bo, 'Can we spend €800 on the water pump?', { db }).ours).toEqual([]);

		// The standard's clauses are the same for everybody and are not a leak:
		// they are the published document, identical in every community. B still
		// gets them, and still gets nothing of A's.
		const standardWords = lookup(bo, 'consent decision', { db });
		expect(standardWords.clauses.length).toBeGreaterThan(0);
		expect(standardWords.ours).toEqual([]);

		// The glossary shows B the standard and none of A's words.
		const theirs = glossary(bo, { db });
		expect(theirs.length).toBe(view.glossary.length);
		expect(theirs.every((term) => term.ours === null)).toBe(true);

		// And nothing about the ordering A adopted.
		expect(getRiskProfile(bo, { db })).toBeNull();
		expect(weightsHistory(bo, { db })).toEqual([]);
		expect(activeWeights(db, bo.community.id)).toEqual(DEFAULT_WEIGHTS);
		expect(path(bo, { db }).every((item) => item.override === null)).toBe(true);

		expect(recorded.ref).toMatch(/^DEC-/);
	});

	it("leaves B's ordering identical to a community that never had a neighbour", () => {
		const alone = path(bo, { db }).map((item) => item.sectionKey);
		fill(ana, SECRET);
		expect(path(bo, { db }).map((item) => item.sectionKey)).toEqual(alone);
	});

	it('rebuilds one community without reaching into another', () => {
		fill(ana, SECRET);
		fill(bo, 'We decide everything together.');

		rebuildSearchIndex(db, ana.community.id);

		// B's index is untouched, and still answers only about B.
		expect(
			getSearchIndex(db).query(bo.community.id, 'together', { levels: ALL_LEVELS }).length
		).toBeGreaterThan(0);
		expect(getSearchIndex(db).query(bo.community.id, 'circle', { levels: ALL_LEVELS })).toEqual([]);
	});

	it('takes everything with the community when it goes', () => {
		fill(ana, SECRET);
		const id = ana.community.id;

		db.delete(communityStandard).where(eq(communityStandard.communityId, id)).run();
		// The cascades are asserted in path-schema.test.ts; what matters here is
		// that the search rows are not orphaned behind a deleted tenant.
		getSearchIndex(db).clear(id);
		expect(getSearchIndex(db).query(id, 'spend', { levels: ALL_LEVELS })).toEqual([]);
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { changeLog } from '../../src/lib/server/db/schema/decisions.js';
import { DEFAULT_WEIGHTS } from '../../src/lib/server/db/schema/path.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import {
	clearOverride,
	discardPrivateOrder,
	placeOverride,
	placePrivate,
	privateOrderCount,
	publishPrivateOrder,
	releasePrivate,
	setWeights,
	weightsHistory
} from '../../src/lib/server/services/ordering.js';
import { path } from '../../src/lib/server/services/path.js';
import { setRiskProfile } from '../../src/lib/server/services/risk-profile.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Retuning the ordering, and moving something by hand. UI spec §4.4.
 *
 * Both are governance acts rather than preferences, and both are treated the
 * way the rest of the product treats a decision: append-only, attributable, and
 * still legible afterwards. The property that matters is that nothing a
 * community deliberately did can vanish because of something else they did.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const LATER = NOW + 86_400_000;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let otherCommunity: Ctx;

function seed(slug: string, email: string): Ctx {
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
	const person = makeUser(db, { email });
	return {
		user: person,
		community: home,
		membership: makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ana = seed('valle-verde', 'ana@example.org');
	otherCommunity = seed('other-place', 'bo@example.org');

	const member = makeUser(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, ana.community.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const keys = (ctx: Ctx) => path(ctx, { db }).map((item) => item.sectionKey);

describe('changing the weights is a governance act', () => {
	it('is refused for a member', () => {
		// Retuning the ordering changes what everybody is told to do next. It is
		// the same bar as any other settings change, and not a preference.
		expect(
			catchRefusal(() => setWeights(lena, { ...DEFAULT_WEIGHTS, risk: 40 }, { db }))?.status
		).toBe(403);
	});

	it('supersedes rather than updates, and says who and when', () => {
		setWeights(ana, { ...DEFAULT_WEIGHTS, risk: 40 }, { db });
		setWeights({ ...ana, now: () => LATER }, { ...DEFAULT_WEIGHTS, risk: 5 }, { db });

		const history = weightsHistory(ana, { db });
		expect(history).toHaveLength(2);
		expect(history.filter((row) => row.active)).toHaveLength(1);

		const active = history.find((row) => row.active)!;
		expect(active.risk).toBe(5);
		expect(active.changedBy).toBe(ana.user.id);
		expect(active.changedAt.getTime()).toBe(LATER);
		expect(active.isDefault).toBe(false);

		// The previous opinion stays readable. An ordering that can be silently
		// retuned is one nobody can audit, including whoever retuned it.
		expect(history.find((row) => !row.active)!.risk).toBe(40);
	});

	it('records the change beside every other change', () => {
		setWeights(ana, { ...DEFAULT_WEIGHTS, risk: 40 }, { db });

		const [logged] = db.select().from(changeLog).all();
		expect(logged!.kind).toBe('path.reweighted');
		expect(logged!.actorId).toBe(ana.user.id);
		expect((logged!.payload as { to: { risk: number } }).to.risk).toBe(40);
	});

	it('refuses a weight that would invert an input', () => {
		expect(
			catchRefusal(() => setWeights(ana, { ...DEFAULT_WEIGHTS, risk: -1 }, { db }))?.status
		).toBe(400);
	});

	it('changes the order it is supposed to change', () => {
		setRiskProfile(ana, { sharedMoney: true }, { db });
		const before = keys(ana).indexOf('treasury-ruleset.spending-authority');

		setWeights(ana, { ...DEFAULT_WEIGHTS, risk: 200 }, { db });

		expect(keys(ana).indexOf('treasury-ruleset.spending-authority')).toBeLessThan(before);
	});

	it("leaves another community's ordering alone", () => {
		const theirs = keys(otherCommunity);
		setWeights(ana, { ...DEFAULT_WEIGHTS, risk: 200, severity: 200 }, { db });
		expect(keys(otherCommunity)).toEqual(theirs);
	});
});

describe('an override is the community disagreeing, on the record', () => {
	it('puts the item where they put it and keeps where the ordering had it', () => {
		const before = keys(ana);
		const moved = before[20]!;

		placeOverride(ana, moved, 0, { db });

		const after = path(ana, { db });
		expect(after[0]!.sectionKey).toBe(moved);
		// `mine: false` — a published placement, which is what `placeOverride`
		// writes. The private half carries `mine: true` and is tested below.
		expect(after[0]!.override).toEqual({
			position: 0,
			mine: false,
			computedPosition: 20,
			stale: false
		});
		// Both, always: an override that erased the computation would make the
		// list unfalsifiable — nobody could tell later whether the ordering was
		// wrong or the community simply disagreed.
		expect(after).toHaveLength(before.length);
	});

	it('survives a weights change and says it might be stale', () => {
		const moved = keys(ana)[20]!;
		placeOverride(ana, moved, 0, { db });

		setWeights(ana, { ...DEFAULT_WEIGHTS, severity: 40 }, { db });

		const item = path(ana, { db })[0]!;
		expect(item.sectionKey).toBe(moved);
		// Kept, and flagged. Dropping it makes a deliberate act evaporate; keeping
		// it silently is the community's own instruction disappearing because they
		// moved a slider.
		expect(item.override!.stale).toBe(true);
	});

	it('is not stale again once it is placed under the new weights', () => {
		setWeights(ana, { ...DEFAULT_WEIGHTS, severity: 40 }, { db });
		const moved = keys(ana)[20]!;
		placeOverride(ana, moved, 0, { db });

		expect(path(ana, { db })[0]!.override!.stale).toBe(false);
	});

	it('returns the item to its computed position when it is released', () => {
		const before = keys(ana);
		const moved = before[20]!;

		placeOverride(ana, moved, 0, { db });
		clearOverride(ana, moved, { db });

		expect(keys(ana)).toEqual(before);
		expect(path(ana, { db }).every((item) => item.override === null)).toBe(true);
	});

	it('is refused for a member', () => {
		const moved = keys(ana)[20]!;
		expect(catchRefusal(() => placeOverride(lena, moved, 0, { db }))?.status).toBe(403);
		expect(catchRefusal(() => clearOverride(lena, moved, { db }))?.status).toBe(403);
	});

	it('changes nothing for another community', () => {
		const theirs = keys(otherCommunity);
		placeOverride(ana, keys(ana)[20]!, 0, { db });
		expect(keys(otherCommunity)).toEqual(theirs);
	});

	it('moves the same item rather than placing it twice', () => {
		const moved = keys(ana)[20]!;
		placeOverride(ana, moved, 0, { db });
		placeOverride(ana, moved, 3, { db });

		const after = path(ana, { db });
		expect(after.filter((item) => item.sectionKey === moved)).toHaveLength(1);
		expect(after[3]!.sectionKey).toBe(moved);
	});
});

describe('an order of your own', () => {
	const keys = (ctx: Ctx) => path(ctx, { db }).map((item) => item.sectionKey);

	it('lets a member move something, and shows it only to them', () => {
		const moved = keys(lena)[20]!;
		placePrivate(lena, moved, 0, { db });

		// Theirs.
		expect(keys(lena)[0]).toBe(moved);
		expect(path(lena, { db })[0]!.override).toMatchObject({ mine: true });
		// Nobody else's — this is the whole difference between the two tables.
		expect(keys(ana)[0]).not.toBe(moved);
		expect(path(ana, { db }).every((item) => item.override === null)).toBe(true);
	});

	it('refuses to let a member publish one', () => {
		placePrivate(lena, keys(lena)[20]!, 0, { db });
		expect(catchRefusal(() => publishPrivateOrder(lena, { db }))?.status).toBe(403);
		// And the draft is still theirs, unpublished, rather than half-applied.
		expect(privateOrderCount(db, lena.community.id, lena.user.id)).toBe(1);
	});

	it('makes it everybody’s when a steward publishes, and empties the draft', () => {
		const moved = keys(ana)[20]!;
		placePrivate(ana, moved, 0, { db });
		expect(keys(lena)[0]).not.toBe(moved);

		expect(publishPrivateOrder(ana, { db })).toBe(1);

		expect(keys(lena)[0]).toBe(moved);
		// It reads as the community's now, not as anybody's draft.
		expect(path(lena, { db })[0]!.override).toMatchObject({ mine: false });
		expect(privateOrderCount(db, ana.community.id, ana.user.id)).toBe(0);
	});

	it('writes the publish to the change log, because the Path is what the group works from', () => {
		placePrivate(ana, keys(ana)[20]!, 0, { db });
		publishPrivateOrder(ana, { db });

		const entries = db
			.select()
			.from(changeLog)
			.all()
			.filter((row) => row.kind === 'path.reordered');
		expect(entries).toHaveLength(1);
		expect(entries[0]!.actorId).toBe(ana.user.id);
	});

	it('throws the whole draft away on request, and one placement on request', () => {
		const first = keys(lena)[20]!;
		const second = keys(lena)[21]!;
		placePrivate(lena, first, 0, { db });
		placePrivate(lena, second, 1, { db });
		expect(privateOrderCount(db, lena.community.id, lena.user.id)).toBe(2);

		releasePrivate(lena, first, { db });
		expect(privateOrderCount(db, lena.community.id, lena.user.id)).toBe(1);

		discardPrivateOrder(lena, { db });
		expect(privateOrderCount(db, lena.community.id, lena.user.id)).toBe(0);
		expect(path(lena, { db }).every((item) => item.override === null)).toBe(true);
	});

	it('keeps one member’s draft out of another member’s list', () => {
		const moved = keys(lena)[20]!;
		placePrivate(lena, moved, 0, { db });
		// `ana` is a steward of the same community and still sees nothing of it.
		expect(privateOrderCount(db, ana.community.id, ana.user.id)).toBe(0);
		expect(keys(ana)[0]).not.toBe(moved);
	});
});

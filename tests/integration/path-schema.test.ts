import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import {
	DEFAULT_WEIGHTS,
	pathOverride,
	pathWeights,
	riskProfile
} from '../../src/lib/server/db/schema/path.js';
import { community } from '../../src/lib/server/db/schema/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeUser } from '../support/factories.js';

/**
 * What the database refuses about the ordering.
 *
 * The ordering is a governance opinion a community adopted, so the shapes that
 * would make it unauditable are the ones worth making impossible: two active
 * weight sets, a placement in a position that cannot exist, an answer to the
 * meeting question that is none of the three.
 */
const NOW = new Date(Date.UTC(2026, 8, 4, 12, 0, 0));

let db: Db;
let cleanup: () => void;
let communityId: string;
let otherId: string;
let userId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	communityId = makeCommunity(db, { slug: 'valle-verde' }).id;
	otherId = makeCommunity(db, { slug: 'other-place' }).id;
	userId = makeUser(db, { email: 'ana@example.org' }).id;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const weights = (overrides: Partial<typeof pathWeights.$inferInsert> = {}) => ({
	id: newId(),
	communityId,
	...DEFAULT_WEIGHTS,
	isDefault: true,
	active: true,
	changedBy: userId,
	changedAt: NOW,
	...overrides
});

describe('one active set of weights per community', () => {
	it('refuses a second active set', () => {
		db.insert(pathWeights).values(weights()).run();
		// Two active sets means the ordering has two answers and no way to say
		// which one produced the list somebody is looking at.
		expect(() => db.insert(pathWeights).values(weights()).run()).toThrow(/UNIQUE/i);
	});

	it('keeps the superseded set beside the active one', () => {
		const first = weights();
		db.insert(pathWeights).values(first).run();
		db.update(pathWeights).set({ active: false }).where(eq(pathWeights.id, first.id)).run();
		db.insert(pathWeights)
			.values(weights({ isDefault: false, risk: 40 }))
			.run();

		const rows = db.select().from(pathWeights).all();
		expect(rows).toHaveLength(2);
		expect(rows.filter((row) => row.active)).toHaveLength(1);
		// The previous opinion is still readable, with who held it and when.
		const superseded = rows.find((row) => !row.active)!;
		expect(superseded.changedBy).toBe(userId);
		expect(superseded.risk).toBe(DEFAULT_WEIGHTS.risk);
	});

	it('lets two communities each have their own active set', () => {
		db.insert(pathWeights).values(weights()).run();
		db.insert(pathWeights)
			.values(weights({ communityId: otherId }))
			.run();
		expect(db.select().from(pathWeights).all()).toHaveLength(2);
	});

	it('refuses a negative weight', () => {
		// A negative weight would invert an input rather than silence it, which is
		// neither what the screen offers nor something the reasons could explain.
		expect(() =>
			db
				.insert(pathWeights)
				.values(weights({ risk: -1 }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('accepts zero, which is how an input is switched off', () => {
		db.insert(pathWeights)
			.values(weights({ risk: 0 }))
			.run();
		expect(db.select().from(pathWeights).all()[0]!.risk).toBe(0);
	});
});

describe('an override belongs to one community', () => {
	const override = (overrides: Partial<typeof pathOverride.$inferInsert> = {}) => ({
		communityId,
		sectionKey: 'purpose-charter.primary-purpose',
		position: 0,
		weightsIdAtPlacement: null,
		placedBy: userId,
		placedAt: NOW,
		...overrides
	});

	it('refuses the same section placed twice', () => {
		db.insert(pathOverride).values(override()).run();
		expect(() =>
			db
				.insert(pathOverride)
				.values(override({ position: 3 }))
				.run()
		).toThrow(/UNIQUE/i);
	});

	it('lets another community place the same section', () => {
		db.insert(pathOverride).values(override()).run();
		db.insert(pathOverride)
			.values(override({ communityId: otherId }))
			.run();

		const mine = db
			.select()
			.from(pathOverride)
			.where(eq(pathOverride.communityId, communityId))
			.all();
		expect(mine).toHaveLength(1);
	});

	it('refuses a position that cannot exist', () => {
		expect(() =>
			db
				.insert(pathOverride)
				.values(override({ position: -1 }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('goes when its community goes', () => {
		db.insert(pathWeights).values(weights()).run();
		db.insert(pathOverride).values(override()).run();

		db.delete(community).where(eq(community.id, communityId)).run();

		expect(db.select().from(pathOverride).all()).toHaveLength(0);
		expect(db.select().from(pathWeights).all()).toHaveLength(0);
	});
});

describe('the risk profile', () => {
	const profile = (overrides: Partial<typeof riskProfile.$inferInsert> = {}) => ({
		communityId,
		holdsLand: null,
		sharedMoney: null,
		childrenOnSite: null,
		founderOwner: null,
		meets: null,
		updatedBy: userId,
		updatedAt: NOW,
		...overrides
	});

	it('refuses an answer to the meeting question that is none of the three', () => {
		expect(() =>
			db
				.insert(riskProfile)
				.values(profile({ meets: 'sometimes' as 'both' }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('accepts each of the three, and none', () => {
		for (const meets of ['in_person', 'online', 'both', null] as const) {
			db.delete(riskProfile).where(eq(riskProfile.communityId, communityId)).run();
			db.insert(riskProfile).values(profile({ meets })).run();
			expect(db.select().from(riskProfile).all()[0]!.meets).toBe(meets);
		}
	});

	it('holds a partly-answered interview', () => {
		// Somebody answers two questions and comes back later. Null is "not
		// answered", which is a different thing from "no".
		db.insert(riskProfile)
			.values(profile({ holdsLand: true, sharedMoney: false }))
			.run();

		const [row] = db.select().from(riskProfile).all();
		expect(row!.holdsLand).toBe(true);
		expect(row!.sharedMoney).toBe(false);
		expect(row!.childrenOnSite).toBeNull();
	});

	it('is one profile per community', () => {
		db.insert(riskProfile).values(profile()).run();
		expect(() => db.insert(riskProfile).values(profile()).run()).toThrow(/UNIQUE|PRIMARY/i);
	});
});

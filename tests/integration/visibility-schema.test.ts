import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition } from '../../src/lib/server/db/schema/definitions.js';
import { community } from '../../src/lib/server/db/schema/tenancy.js';
import { transparencyException } from '../../src/lib/server/db/schema/visibility.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeUser } from '../support/factories.js';

/**
 * What the database refuses about visibility.
 *
 * The three levels are enforced by triggers rather than a CHECK, because adding
 * a CHECK to an existing table makes drizzle rebuild it and the rebuild eats
 * child rows (`migration-upgrade.test.ts`). A trigger is the same guarantee at
 * the same layer, and this is what proves it is actually there — an enforcement
 * mechanism nobody tests is a comment.
 */
const NOW = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
const SOON = new Date(Date.UTC(2026, 11, 1, 12, 0, 0));

let db: Db;
let cleanup: () => void;
let communityId: string;
let userId: string;

const aDefinition = (overrides: Partial<typeof definition.$inferInsert> = {}) => ({
	id: newId(),
	communityId,
	scope: 'local' as const,
	attachKind: 'rcos_artifact' as const,
	attachRcosArtifactKey: 'purpose-charter',
	provisional: false,
	createdAt: NOW,
	updatedAt: NOW,
	...overrides
});

const anException = (overrides: Partial<typeof transparencyException.$inferInsert> = {}) => ({
	id: newId(),
	communityId,
	subjectType: 'definition' as const,
	subjectId: 'subject-1',
	audience: 'stewards' as const,
	justification: 'A member asked for their circumstances not to be readable by everyone.',
	decisionId: null,
	expiresAt: SOON,
	expiredAt: null,
	renewsId: null,
	createdBy: userId,
	createdAt: NOW,
	...overrides
});

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	communityId = makeCommunity(db, { slug: 'valle-verde' }).id;
	userId = makeUser(db, { email: 'ana@example.org' }).id;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('the three levels, enforced', () => {
	it('accepts each of them', () => {
		for (const visibility of ['member', 'world', 'restricted'] as const) {
			const row = aDefinition({ visibility });
			db.insert(definition).values(row).run();
			expect(db.select().from(definition).where(eq(definition.id, row.id)).get()!.visibility).toBe(
				visibility
			);
		}
	});

	it('refuses a fourth on insert', () => {
		expect(() =>
			db
				.insert(definition)
				.values(aDefinition({ visibility: 'public' as 'world' }))
				.run()
		).toThrow(/member, world or restricted/);
	});

	it('refuses a fourth on update, which is the way it would actually happen', () => {
		// The insert path goes through a service with a typed argument. An update
		// is where a string arrives from somewhere less careful.
		const row = aDefinition();
		db.insert(definition).values(row).run();

		expect(() =>
			db
				.update(definition)
				.set({ visibility: 'everyone' as 'world' })
				.where(eq(definition.id, row.id))
				.run()
		).toThrow(/member, world or restricted/);
	});

	it('defaults to member, which is the level that publishes nothing', () => {
		const row = aDefinition();
		db.insert(definition).values(row).run();
		const stored = db.select().from(definition).where(eq(definition.id, row.id)).get()!;
		expect(stored.visibility).toBe('member');
		expect(stored.firstPublishedAt).toBeNull();
	});
});

describe('an exception is justified, addressed and time-bounded', () => {
	it('refuses one with no justification', () => {
		expect(() =>
			db
				.insert(transparencyException)
				.values(anException({ justification: '   ' }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('refuses an audience nobody could be in', () => {
		expect(() =>
			db
				.insert(transparencyException)
				.values(anException({ audience: 'everyone' as 'stewards' }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('refuses a subject type that is not restrictable', () => {
		expect(() =>
			db
				.insert(transparencyException)
				.values(anException({ subjectType: 'discussion' as 'definition' }))
				.run()
		).toThrow(/CHECK constraint/i);
	});

	it('allows one live exception per subject and no more', () => {
		db.insert(transparencyException).values(anException()).run();
		// Two justifications and two end dates for one hidden thing, with no
		// answer to which applies.
		expect(() => db.insert(transparencyException).values(anException()).run()).toThrow(/UNIQUE/i);
	});

	it('keeps expired ones beside the live one, as history', () => {
		const first = anException();
		db.insert(transparencyException).values(first).run();
		db.update(transparencyException)
			.set({ expiredAt: NOW })
			.where(eq(transparencyException.id, first.id))
			.run();

		// The renewal, pointing back at what it renewed — "why is this still
		// hidden" is the question an auditor asks.
		db.insert(transparencyException)
			.values(anException({ renewsId: first.id }))
			.run();

		const rows = db.select().from(transparencyException).all();
		expect(rows).toHaveLength(2);
		expect(rows.filter((row) => row.expiredAt === null)).toHaveLength(1);
		expect(rows.find((row) => row.renewsId)!.renewsId).toBe(first.id);
	});

	it('goes when its community goes', () => {
		db.insert(transparencyException).values(anException()).run();
		db.delete(community).where(eq(community.id, communityId)).run();
		expect(db.select().from(transparencyException).all()).toEqual([]);
	});
});

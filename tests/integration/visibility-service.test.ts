import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anonymousIn } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { changeLog } from '../../src/lib/server/db/schema/decisions.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { transparencyException } from '../../src/lib/server/db/schema/visibility.js';
import { getDefinition } from '../../src/lib/server/services/definitions.js';
import { compliance, readiness } from '../../src/lib/server/services/readiness.js';
import {
	expireExceptions,
	liveException,
	listExceptions,
	renewException,
	restrict
} from '../../src/lib/server/services/visibility.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Restriction, and the two things it must never be.
 *
 * It must never be a permission somebody set once — hence a justification, an
 * audience and an end date, written with the state or not at all. And it must
 * never be a way to look more compliant: a restricted definition still answers
 * its clause, still counts, and still appears in an audit. Hiding something
 * from the neighbours cannot change what is true about a community.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const NEXT_MONTH = new Date(Date.UTC(2026, 10, 1, 12, 0, 0));
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let standardRowId: string;

/** An adopted definition answering a real clause, so readiness moves for it. */
function adopt(visibility: 'member' | 'world' = 'member'): string {
	const id = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id,
			communityId: ana.community.id,
			scope: 'standard',
			communityStandardId: standardRowId,
			sectionKey: COUNTABLE.owner!,
			adoptedVersionId: versionId,
			provisional: false,
			visibility,
			createdBy: ana.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId: id,
			n: 1,
			body: 'Members may leave at any time.',
			plainLanguage: null,
			type: null,
			authorId: ana.user.id,
			aiAssisted: false,
			aiTask: null,
			linterResult: null,
			createdAt: new Date(NOW),
			adoptedAt: new Date(NOW),
			decisionId: null,
			supersedesVersionId: null
		})
		.run();
	return id;
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardRowId = newId();
	db.insert(communityStandard)
		.values({
			id: standardRowId,
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const steward = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
	const member = makeUser(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, home.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const restriction = {
	justification: 'A member asked for their circumstances not to be readable by everyone.',
	audience: 'stewards' as const,
	expiresAt: NEXT_MONTH
};

describe('restricting something is one act, not two', () => {
	it('writes the state and the reason together', () => {
		const id = adopt();
		const exception = restrict(ana, { type: 'definition', id }, restriction, { db });

		expect(db.select().from(definition).where(eq(definition.id, id)).get()!.visibility).toBe(
			'restricted'
		);
		expect(exception.justification).toContain('circumstances');
		expect(exception.expiresAt.getTime()).toBe(NEXT_MONTH.getTime());
		expect(exception.createdBy).toBe(ana.user.id);
	});

	it('leaves nothing behind when the subject does not exist', () => {
		expect(
			catchRefusal(() => restrict(ana, { type: 'definition', id: 'no-such' }, restriction, { db }))
				?.status
		).toBe(404);
		// Not an exception pointing at nothing, which the expiry job would then
		// carry forever.
		expect(db.select().from(transparencyException).all()).toEqual([]);
	});

	it('refuses a justification that says nothing', () => {
		const id = adopt();
		expect(
			catchRefusal(() =>
				restrict(ana, { type: 'definition', id }, { ...restriction, justification: '  ' }, { db })
			)?.status
		).toBe(400);
		expect(db.select().from(definition).where(eq(definition.id, id)).get()!.visibility).toBe(
			'member'
		);
	});

	it('refuses an expiry that has already passed', () => {
		const id = adopt();
		expect(
			catchRefusal(() =>
				restrict(
					ana,
					{ type: 'definition', id },
					{ ...restriction, expiresAt: new Date(NOW - 1) },
					{
						db
					}
				)
			)?.status
		).toBe(400);
	});

	it('is a steward act', () => {
		const id = adopt();
		expect(
			catchRefusal(() => restrict(lena, { type: 'definition', id }, restriction, { db }))?.status
		).toBe(403);
	});

	it('says so in the change log', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });
		const [logged] = db.select().from(changeLog).all();
		expect(logged!.kind).toBe('visibility.restricted');
		expect(logged!.subjectId).toBe(id);
	});
});

describe('who can see a restricted thing', () => {
	it('is invisible to a member who is not in its audience', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });

		// The same answer as for something that does not exist. "You may not see
		// this" would confirm that it does.
		expect(catchRefusal(() => getDefinition(lena, id, { db }))?.status).toBe(404);
	});

	it('is visible to the audience it names', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });
		expect(getDefinition(ana, id, { db }).id).toBe(id);
	});

	it('is invisible to the world', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });
		expect(
			catchRefusal(() => getDefinition(anonymousIn(ana.community.id), id, { db }))?.status
		).toBe(404);
	});
});

describe('restriction is not a way to look more compliant', () => {
	it('leaves readiness and the claim exactly where they were', () => {
		const id = adopt();
		const before = { readiness: readiness(ana, { db }), compliance: compliance(ana, { db }) };

		restrict(ana, { type: 'definition', id }, restriction, { db });

		// A restricted definition still answers its clause. If hiding something
		// changed the number, restriction would be a lever on the compliance claim
		// rather than a privacy measure.
		expect(readiness(ana, { db })).toEqual(before.readiness);
		expect(compliance(ana, { db })).toEqual(before.compliance);
	});

	it('counts the same for a member who cannot see it', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });

		// The aggregates describe the community, not the reader. Two members
		// seeing two different readiness figures would make the number meaningless.
		expect(readiness(lena, { db })).toEqual(readiness(ana, { db }));
	});
});

describe('an exception ends', () => {
	it('reverts the subject and says so', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });

		const result = expireExceptions(db, NEXT_MONTH.getTime());

		expect(result.expired).toBe(1);
		expect(db.select().from(definition).where(eq(definition.id, id)).get()!.visibility).toBe(
			'member'
		);
		expect(
			db
				.select()
				.from(changeLog)
				.all()
				.some((row) => row.kind === 'visibility.exception_expired')
		).toBe(true);
	});

	it('does nothing before the date, and nothing twice after it', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });

		expect(expireExceptions(db, NOW).expired).toBe(0);
		expect(expireExceptions(db, NEXT_MONTH.getTime()).expired).toBe(1);
		// Safe to arm on a schedule: a second run finds nothing left to do.
		expect(expireExceptions(db, NEXT_MONTH.getTime()).expired).toBe(0);
		expect(
			db
				.select()
				.from(changeLog)
				.all()
				.filter((row) => row.kind.endsWith('expired'))
		).toHaveLength(1);
	});

	it('keeps the justification it replaced when it is renewed', () => {
		const id = adopt();
		restrict(ana, { type: 'definition', id }, restriction, { db });

		renewException(
			ana,
			{ type: 'definition', id },
			{ ...restriction, justification: 'Still true, and they asked again.' },
			{ db }
		);

		const all = listExceptions(ana, { db });
		expect(all).toHaveLength(2);
		expect(all.filter((row) => row.expiredAt === null)).toHaveLength(1);
		// Both readable: "why is this still hidden" has a history, not just a
		// current answer.
		expect(all.map((row) => row.justification).join(' ')).toContain('circumstances');

		const live = liveException(db, ana.community.id, { type: 'definition', id })!;
		expect(live.renewsId).toBe(all.find((row) => row.expiredAt !== null)!.id);
		// Renewed, so it is not swept by the expiry that would have caught the old one.
		expect(expireExceptions(db, NOW).expired).toBe(0);
	});
});

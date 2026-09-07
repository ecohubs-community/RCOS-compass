import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Audience } from '../../src/lib/server/auth/audience.js';
import { anonymousIn, asSignedIn } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';
import { READ_PATHS } from '../support/read-paths.js';

/**
 * Every read path, and whether it knows who is asking.
 * `docs/03-data-model.md` §9, `docs/04-security.md` §4.
 *
 * The cross-tenant suite is parameterised over `services/registry.ts` so that a
 * service added without being registered fails the suite rather than being
 * covered by somebody remembering. This is the same idea for the second
 * boundary: a read path that cannot tell an anonymous reader from a member is a
 * read path that will hand member content to the world the day it is wired to a
 * public route.
 *
 * **It is written before the filter exists.** Every entry is marked `pending`
 * and runs under `it.fails`, which asserts the true statement about today's
 * code — *this service cannot answer an anonymous audience, because it takes a
 * `Ctx` and a `Ctx` is a member by construction*. The marker clears itself: the
 * moment a service is converted its test passes, `it.fails` goes red, and
 * whoever converted it has to remove the marker. That keeps the gate meaningful
 * for the fortnight this phase runs, which a permanently red suite would not —
 * a suite that is always red is a suite nobody reads.
 *
 * **What it deliberately does not cover.** `readiness()`, `compliance()` and
 * `path()` return computed numbers rather than rows, and the shape below —
 * seed one `member` row and one `world` row, expect one back — asserts nothing
 * about them. Listing them here would produce entries that pass whatever the
 * code does, which reads as coverage and is worse than a shorter registry. What
 * must be true of them is the opposite property, and it is asserted separately:
 * they count what a community has regardless of who is looking, so hiding
 * something never makes a community look more compliant.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ctx: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const home = makeCommunity(db, { slug: 'valle-verde' });
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
	const person = makeUser(db, { email: 'ana@example.org' });
	ctx = {
		user: person,
		community: home,
		membership: makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('every read path knows who is asking', () => {
	it('covers every row-returning read service', () => {
		// The list is the point. A service that returns rows a community owns and
		// is not here is a service nothing below checks.
		expect(READ_PATHS.length).toBeGreaterThan(0);
		const names = READ_PATHS.map((path) => path.name);
		expect(new Set(names).size, 'duplicate entries').toBe(names.length);
	});

	it('declares what is still pending, so progress is countable', () => {
		const pending = READ_PATHS.filter((path) => path.pending);
		// Not zero yet, and not silently growing either: an entry added and marked
		// pending shows up here rather than disappearing into a long green list.
		expect(pending.length).toBeLessThanOrEqual(READ_PATHS.length);
	});

	for (const path of READ_PATHS) {
		describe(path.name, () => {
			const test = path.pending ? it.fails : it;

			test('shows an anonymous reader only what is published', () => {
				const seeded = path.seed(db, ctx);
				const audience: Audience = anonymousIn(ctx.community.id);

				const rows = path.read(audience, db, seeded);

				// One `member` row and one `world` row went in. Exactly one comes back.
				expect(rows.map((row) => row.id).sort()).toEqual([seeded.world]);
			});

			test('shows a member both', () => {
				const seeded = path.seed(db, ctx);

				const rows = path.read(asSignedIn(ctx), db, seeded);

				expect(rows.map((row) => row.id).sort()).toEqual([seeded.member, seeded.world].sort());
			});
		});
	}
});

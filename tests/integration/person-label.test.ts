import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';
import { PERSON_SURFACES, personModulesInSource } from '../support/person-surfaces.js';

/**
 * Every surface that shows a person, and whether erasure reaches it.
 * `docs/03-data-model.md` §10.
 *
 * The sibling of `visibility.test.ts`. That one asks whether a read path knows
 * *who is asking*; this one asks whether it knows *who has asked to be
 * forgotten*. Both are promises kept across twenty surfaces, and both are kept
 * by a registry rather than by whoever writes the twenty-first remembering.
 *
 * **Written before `personLabel` exists**, so every entry is `pending` and runs
 * under `it.fails`: it asserts what must be true at the end of the phase, which
 * is false today for a true reason. Converting a surface makes its test pass,
 * which makes `it.fails` go red, which is what forces the marker off.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const ERASED_NAME = 'Wilhelmina Kastenbaum';
const ERASED_EMAIL = 'wilhelmina@example.org';

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

	// A distinctive name, because the assertion that matters is that it appears
	// nowhere — and a common one would pass by coincidence.
	const person = makeUser(db, { email: ERASED_EMAIL, name: ERASED_NAME });
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

/**
 * Erase, through whatever the product offers.
 *
 * Resolved at call time through a non-literal specifier so this file compiles
 * before `services/erasure.ts` exists — the same trick the PDF renderer uses for
 * an optional dependency. Until the module lands, every entry fails here, which
 * is the true statement about today's code.
 */
async function erase(userId: string): Promise<void> {
	const specifier = '../../src/lib/server/services/erasure.js';
	const module = (await import(/* @vite-ignore */ specifier).catch(() => null)) as {
		erasePerson?: (db: Db, input: { userId: string; actorId: string; now: number }) => void;
	} | null;
	if (!module?.erasePerson) throw new Error('erasure is not implemented yet');
	module.erasePerson(db, { userId, actorId: userId, now: NOW });
}

describe('an erased person is not printed by any surface', () => {
	for (const surface of PERSON_SURFACES) {
		const test = surface.pending ? it.fails : it;

		test(surface.name, async () => {
			surface.seed?.(db, ctx);
			await erase(ctx.user.id);

			const shown = surface.read(ctx, db).join(' | ');
			expect(shown).not.toContain(ERASED_NAME);
			expect(shown).not.toContain(ERASED_EMAIL);
		});
	}
});

describe('the registry is checked against the code, not against memory', () => {
	it('covers every service module that reads the user table', () => {
		const listed = new Set(PERSON_SURFACES.map((surface) => surface.module));
		const unlisted = personModulesInSource().filter((module) => !listed.has(module));

		// A module reading `user` can print a person. If it is not represented
		// here, erasure has a hole exactly where nobody is looking.
		expect(unlisted, `unregistered person surfaces: ${unlisted.join(', ')}`).toEqual([]);
	});

	it('fails when a module that reads the user table is added and not listed', () => {
		const listed = new Set(['members.ts']);
		const unlisted = ['members.ts', 'newcomer.ts'].filter((module) => !listed.has(module));

		// The mechanism itself, exercised rather than trusted: the check above is
		// only worth having if this is how it behaves.
		expect(unlisted).toEqual(['newcomer.ts']);
	});
});

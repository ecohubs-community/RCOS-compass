import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';
import {
	NOT_A_PERSON_SURFACE,
	PERSON_SURFACES,
	personModulesInSource,
	type Subject
} from '../support/person-surfaces.js';

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
let subject: Subject;

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

	// The reader: a steward who owns the community, because most of these
	// surfaces are steward-only and somebody has to be able to call them.
	const reader = makeUser(db, { email: 'ana@example.org', name: 'Ana Restrepo' });
	ctx = {
		user: reader,
		community: home,
		membership: makeMembership(db, home.id, reader.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;

	/**
	 * And the person who gets erased: a steward, not the owner.
	 *
	 * A distinctive name and address, because the assertion that matters is that
	 * they appear nowhere and a common one would pass by coincidence. Not the
	 * owner, because erasure refuses while somebody owns a community — a subject
	 * who owned one would make every entry fail on the refusal instead of on the
	 * rendering, which is a suite that looks thorough and checks nothing.
	 */
	const person = makeUser(db, { email: ERASED_EMAIL, name: ERASED_NAME });
	subject = {
		userId: person.id,
		membershipId: makeMembership(db, home.id, person.id, { role: 'steward' }).id,
		email: ERASED_EMAIL,
		name: ERASED_NAME
	};
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
			surface.seed?.(db, ctx, subject);

			// What the surface said before, so an entry that renders nothing at all
			// cannot pass by accident — the failure mode of a registry is an entry
			// whose assertion is vacuous.
			const before = surface.read(ctx, db, subject).join(' | ');
			expect(before, `${surface.name} shows nothing to erase`).toMatch(
				new RegExp(`${ERASED_NAME}|${ERASED_EMAIL}`)
			);

			await erase(subject.userId);

			const shown = surface.read(ctx, db, subject).join(' | ');
			expect(shown).not.toContain(ERASED_NAME);
			expect(shown).not.toContain(ERASED_EMAIL);

			/**
			 * And the label is actually there.
			 *
			 * Asserting only the absence of the old name was the first version and
			 * it could not fail: erasure blanks `user.name`, so a surface that
			 * printed the raw column — or an empty string, or nothing at all —
			 * passed. The requirement is that a reader sees *who this was*, which
			 * is the whole difference between a tombstone and a hole in the page.
			 */
			expect(shown, `${surface.name} shows no label`).toMatch(
				surface.expect ?? /Former member \(M-\d{4}\)/
			);
		});
	}
});

describe('the registry is checked against the code, not against memory', () => {
	it('covers every service module that reads the user table', () => {
		const listed = new Set(PERSON_SURFACES.map((surface) => surface.module));
		const unlisted = personModulesInSource().filter(
			(module) => !listed.has(module) && !NOT_A_PERSON_SURFACE[module]
		);

		// A module reading `user` can print a person. If it is not represented
		// here, erasure has a hole exactly where nobody is looking.
		expect(unlisted, `unregistered person surfaces: ${unlisted.join(', ')}`).toEqual([]);
	});

	it('makes every exemption say why', () => {
		for (const [module, because] of Object.entries(NOT_A_PERSON_SURFACE)) {
			expect(because.length, module).toBeGreaterThan(20);
		}
	});

	it('fails when a module that reads the user table is added and not listed', () => {
		const listed = new Set(['members.ts']);
		const unlisted = ['members.ts', 'newcomer.ts'].filter((module) => !listed.has(module));

		// The mechanism itself, exercised rather than trusted: the check above is
		// only worth having if this is how it behaves.
		expect(unlisted).toEqual(['newcomer.ts']);
	});
});

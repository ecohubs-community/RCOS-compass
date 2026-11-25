import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/server/db/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import { joinRequest } from '../../src/lib/server/db/schema/tenancy.js';
import { setDbForTests } from '../../src/lib/server/db/index.js';
import { askedTarget } from '../../src/lib/server/http/redirect-target.js';
import { landingFor } from '../../src/lib/server/services/tenancy.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Where sign-in lands when nobody asked to go anywhere.
 * `openspec/changes/pilot-blockers` — authentication, "Signing in without a
 * destination lands in the person's community".
 */
let db: Db;
let cleanup: () => void;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('landingFor', () => {
	it('takes a member of exactly one community to its dashboard', () => {
		const person = makeUser(db);
		const home = makeCommunity(db, { slug: 'valle-verde' });
		makeMembership(db, home.id, person.id);

		expect(landingFor(db, person.id)).toBe('/c/valle-verde');
	});

	it('leaves somebody in two communities on the front page, whose menu lists both', () => {
		const person = makeUser(db);
		makeMembership(db, makeCommunity(db).id, person.id);
		makeMembership(db, makeCommunity(db).id, person.id);

		expect(landingFor(db, person.id)).toBe('/');
	});

	it('leaves somebody in no community on the front page', () => {
		expect(landingFor(db, makeUser(db).id)).toBe('/');
	});

	it('takes somebody in no community, waiting on a join request, to their waiting page', () => {
		const person = makeUser(db);
		const home = makeCommunity(db);
		db.insert(joinRequest)
			.values({
				id: newId(),
				communityId: home.id,
				userId: person.id,
				createdAt: new Date(0),
				notifiedAt: null
			})
			.run();
		expect(landingFor(db, person.id)).toBe('/join');
	});

	it('does not count a membership that has ended', () => {
		const person = makeUser(db);
		makeMembership(db, makeCommunity(db, { slug: 'left' }).id, person.id, { ended: true });
		makeMembership(db, makeCommunity(db, { slug: 'stayed' }).id, person.id);

		expect(landingFor(db, person.id)).toBe('/c/stayed');
	});

	it('does not send anyone into a community that has been deleted', () => {
		const person = makeUser(db);
		makeMembership(db, makeCommunity(db, { status: 'deleted' }).id, person.id);

		expect(landingFor(db, person.id)).toBe('/');
	});

	it('still lands in a suspended community, which its members can read', () => {
		const person = makeUser(db);
		makeMembership(db, makeCommunity(db, { slug: 'paused', status: 'suspended' }).id, person.id);

		expect(landingFor(db, person.id)).toBe('/c/paused');
	});
});

describe('askedTarget', () => {
	it('tells "asked for nothing" apart from "asked for the front page"', () => {
		expect(askedTarget(null)).toBeNull();
		expect(askedTarget('')).toBeNull();
		expect(askedTarget('/')).toBe('/');
	});

	it('keeps a path on this site, and still refuses one that leaves it', () => {
		expect(askedTarget('/c/valle-verde/d/DEC-2026-014')).toBe('/c/valle-verde/d/DEC-2026-014');
		expect(askedTarget('//evil.example')).toBe('/');
		expect(askedTarget('https://evil.example')).toBe('/');
	});
});

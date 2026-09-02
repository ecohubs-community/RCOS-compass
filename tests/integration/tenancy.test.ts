import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/server/db/index.js';
import { membership } from '../../src/lib/server/db/schema/tenancy.js';
import { eq } from 'drizzle-orm';
import {
	RESERVED_SLUGS,
	resolveCommunity,
	validateSlug
} from '../../src/lib/server/services/tenancy.js';
import { createTestDb } from '../support/db.js';
import {
	makeCommunity,
	makeMembership,
	makeTwoCommunities,
	makeUser
} from '../support/factories.js';

let db: Db;
let cleanup: () => void;

beforeEach(() => ({ db, cleanup } = createTestDb()));
afterEach(() => cleanup());

describe('resolving a community from the URL', () => {
	it('scopes the request to a community the user belongs to', () => {
		const { alice, a } = makeTwoCommunities(db);
		const result = resolveCommunity(db, a.slug, alice.id);

		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.community.id).toBe(a.id);
		expect(result.membership.role).toBe('steward');
	});

	it('carries nothing over when the same user switches community', () => {
		const alice = makeUser(db);
		const first = makeCommunity(db, { slug: 'first' });
		const second = makeCommunity(db, { slug: 'second' });
		makeMembership(db, first.id, alice.id, { role: 'steward' });
		makeMembership(db, second.id, alice.id, { role: 'member' });

		const a = resolveCommunity(db, 'first', alice.id);
		const b = resolveCommunity(db, 'second', alice.id);

		expect(a.kind === 'ok' && a.membership.role).toBe('steward');
		// The role is per community; nothing about the first leaks into the second.
		expect(b.kind === 'ok' && b.membership.role).toBe('member');
	});

	it('reports a community that does not exist as not found', () => {
		const alice = makeUser(db);
		expect(resolveCommunity(db, 'no-such-community', alice.id).kind).toBe('not_found');
	});
});

describe('the tenant boundary discloses nothing', () => {
	it('gives the same answer for someone else’s community as for one that does not exist', () => {
		const { alice, b } = makeTwoCommunities(db);

		const other = resolveCommunity(db, b.slug, alice.id);
		const missing = resolveCommunity(db, 'no-such-community', alice.id);

		// Identical results: telling a stranger a community exists is a disclosure.
		expect(other).toEqual(missing);
		expect(other.kind).toBe('not_found');
	});

	it('treats an anonymous request as not found, not as unauthorised', () => {
		const { a } = makeTwoCommunities(db);
		expect(resolveCommunity(db, a.slug, null).kind).toBe('not_found');
	});

	it('hides a soft-deleted community even from its own members', () => {
		const alice = makeUser(db);
		const gone = makeCommunity(db, { slug: 'gone', status: 'deleted' });
		makeMembership(db, gone.id, alice.id, { role: 'steward' });

		expect(resolveCommunity(db, 'gone', alice.id).kind).toBe('not_found');
	});
});

describe('membership changes take effect on the next request', () => {
	it('refuses a member whose membership has ended', () => {
		const alice = makeUser(db);
		const c = makeCommunity(db, { slug: 'valle-verde' });
		makeMembership(db, c.id, alice.id, { ended: true });

		// The record stays for the register; the access does not.
		expect(resolveCommunity(db, 'valle-verde', alice.id).kind).toBe('not_found');
	});

	it('reflects a role change without a new sign-in', () => {
		const alice = makeUser(db);
		const c = makeCommunity(db, { slug: 'valle-verde' });
		const m = makeMembership(db, c.id, alice.id, { role: 'steward' });

		expect(resolveCommunity(db, 'valle-verde', alice.id)).toMatchObject({
			membership: { role: 'steward' }
		});

		db.update(membership).set({ role: 'member' }).where(eq(membership.id, m.id)).run();

		expect(resolveCommunity(db, 'valle-verde', alice.id)).toMatchObject({
			membership: { role: 'member' }
		});
	});
});

describe('a suspended community', () => {
	it('is readable and exportable, but says so', () => {
		const alice = makeUser(db);
		const c = makeCommunity(db, { slug: 'paused', status: 'suspended' });
		makeMembership(db, c.id, alice.id, { role: 'steward' });

		const result = resolveCommunity(db, 'paused', alice.id);
		expect(result.kind).toBe('read_only');
		if (result.kind !== 'read_only') return;
		expect(result.reason).toMatch(/suspended/i);
	});
});

describe('slugs', () => {
	it('refuses reserved words that would shadow an application route', () => {
		for (const slug of RESERVED_SLUGS) {
			expect(validateSlug(null, slug), slug).toBe('reserved');
		}
	});

	it('refuses a slug that is already taken', () => {
		makeCommunity(db, { slug: 'valle-verde' });
		expect(validateSlug(db, 'valle-verde')).toBe('taken');
	});

	it('refuses malformed slugs', () => {
		expect(validateSlug(null, 'Valle Verde')).toBe('malformed');
		expect(validateSlug(null, 'valle_verde')).toBe('malformed');
		expect(validateSlug(null, '-valle')).toBe('malformed');
		expect(validateSlug(null, 'valle-')).toBe('malformed');
		expect(validateSlug(null, 'ab')).toBe('too_short');
		expect(validateSlug(null, 'a'.repeat(41))).toBe('too_long');
	});

	it('accepts an ordinary one', () => {
		expect(validateSlug(db, 'valle-verde')).toBeNull();
	});
});

describe('the schema enforces what the roles document says', () => {
	it('allows only one owner per community', () => {
		const { a } = makeTwoCommunities(db);
		const second = makeUser(db);
		// Alice is already the owner of A.
		expect(() => makeMembership(db, a.id, second.id, { role: 'steward', isOwner: true })).toThrow();
	});

	it('allows a new owner once the previous membership has ended', () => {
		const c = makeCommunity(db, { slug: 'handover' });
		const first = makeUser(db);
		const secondPerson = makeUser(db);
		makeMembership(db, c.id, first.id, { role: 'steward', isOwner: true, ended: true });

		expect(() =>
			makeMembership(db, c.id, secondPerson.id, { role: 'steward', isOwner: true })
		).not.toThrow();
	});

	it('allows one membership per person per community', () => {
		const c = makeCommunity(db, { slug: 'once' });
		const person = makeUser(db);
		makeMembership(db, c.id, person.id);
		expect(() => makeMembership(db, c.id, person.id)).toThrow();
	});
});

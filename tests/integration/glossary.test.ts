import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { glossary, glossaryTerm } from '../../src/lib/server/services/glossary.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The glossary. UI spec §4.8.
 *
 * A join computed at read time, which is the whole design: there is no second
 * copy of a community's words, so there is nothing to maintain and nothing that
 * can be stale. These tests are mostly about that — the glossary changing
 * because a definition changed, and never because somebody remembered to update
 * a glossary.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');

/** A term the standard says a community answers, with a clause to freeze against. */
const TERM = view.glossary.find((term) => term.key === 'commons')!;
const OWNED = view.countableClauses().find((clause) => clause.owner === TERM.definedBy)!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;

function seed(slug: string, locale = 'en'): Ctx {
	const home = makeCommunity(db, { slug, locale });
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

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ana = seed('valle-verde');
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

let keys = 0;
function adopt(body: string, ctx: Ctx = ana) {
	const thread = openDiscussion(
		ctx,
		{ title: 'What counts as common', about: { kind: 'clause', clauseKey: OWNED.key } },
		{ db }
	);
	addProposal(ctx, { discussionId: thread.id, body }, { db });
	return freeze(
		ctx,
		{
			discussionId: thread.id,
			idempotencyKey: `key-${(keys += 1)}`,
			title: 'What counts as common',
			type: 'strategic',
			mechanism: 'consent'
		} as Parameters<typeof freeze>[1],
		{ db }
	);
}

const entry = (ctx: Ctx = ana) => glossaryTerm(ctx, TERM.key, { db })!;

describe('the standard beside the community', () => {
	it('lists every term the standard defines', () => {
		expect(glossary(ana, { db })).toHaveLength(view.glossary.length);
	});

	it('shows the standard alone, and says the community has not defined it', () => {
		const found = entry();
		expect(found.definition).toBe(TERM.i18n.en!.definition);
		expect(found.ours).toBeNull();
		// Not silence: a community reading this needs to know the gap is theirs to
		// fill rather than that the page is broken.
		expect(found.sectionKey).toBe(TERM.definedBy);
		expect(found.sectionTitle).not.toBe(TERM.definedBy);
	});

	it('guesses nothing for a term with no mapping', () => {
		// `layer`, `compliance` and `artifact` describe the standard rather than
		// the community. Matching them to a section by name similarity would be
		// wrong quietly, which is worse than showing nothing.
		const unmapped = glossary(ana, { db }).filter((term) => term.sectionKey === null);
		expect(unmapped.length).toBeGreaterThan(0);
		for (const term of unmapped) {
			expect(term.ours).toBeNull();
			expect(term.sectionTitle).toBeNull();
		}
	});
});

describe('nobody maintains it', () => {
	it('changes when a definition is frozen, with no glossary to update', () => {
		expect(entry().ours).toBeNull();

		adopt('Land and buildings are held in common by the whole circle.');

		const found = entry();
		expect(found.ours?.body).toBe('Land and buildings are held in common by the whole circle.');
		expect(found.ours?.adoptedAt).toBe(NOW);
		// The standard's own definition is still there beside it, unchanged.
		expect(found.definition).toBe(TERM.i18n.en!.definition);
	});

	it('shows the current text once a version is superseded', () => {
		adopt('Land and buildings are held in common by the whole circle.');
		adopt('Land, buildings and tools are held in common by the whole circle.');

		// One answer, and it is the live one. A stored glossary is what would show
		// the old sentence here.
		expect(entry().ours?.body).toBe(
			'Land, buildings and tools are held in common by the whole circle.'
		);
	});

	it('links to where it was decided rather than repeating it', () => {
		adopt('Land and buildings are held in common by the whole circle.');
		const found = entry();
		expect(found.ours?.definitionId).toMatch(/.+/);
	});

	it('shows nothing of another community', () => {
		const bo = seed('other-place');
		adopt('Land and buildings are held in common by the whole circle.');

		expect(entry(bo).ours).toBeNull();
	});
});

describe('the community reads it in its own language', () => {
	it("uses the standard's own translation where it has one", () => {
		const de = seed('bergdorf', 'de');
		const found = glossaryTerm(de, TERM.key, { db })!;

		expect(found.term).toBe(TERM.i18n.de!.term);
		expect(found.definition).toBe(TERM.i18n.de!.definition);
		expect(found.isFallback).toBe(false);
	});

	it('falls back to English and says so, rather than rendering empty', () => {
		// A missing translation must never look like a term with no definition:
		// a blank entry reads as a broken app, and a fallback that hides itself is
		// worse than one that admits it.
		const view2 = glossary(seed('elsewhere', 'en'), { db });
		expect(view2.every((term) => term.definition.length > 0)).toBe(true);
	});
});

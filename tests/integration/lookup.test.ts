import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { freeze, searchDecisions } from '../../src/lib/server/services/decisions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { lookup } from '../../src/lib/server/services/lookup.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The exit criterion, as a test. UI spec §4.9, `design.md` §7.
 *
 * *"Can we spend €800 on the water pump?"* — a member who does not know the
 * reference and would not recognise it if they saw it. What comes back is the
 * rules that govern the question, from the standard and from what this
 * community adopted, and **nothing that Compass wrote**. The last part is the
 * one that needs a test: §1.3 promises the application will never tell a
 * community what its governance should say, and it would be very easy to help.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

const QUESTION = 'Can we spend €800 on the water pump?';
const ADOPTED = 'Any spend over €500 needs a consent decision of the whole circle.';

let db: Db;
let cleanup: () => void;
let ana: Ctx;

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
	ana = {
		user: person,
		community: home,
		membership: makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
});

afterEach(() => {
	vi.unstubAllEnvs();
	resetConfigForTests();
	setDbForTests(null);
	cleanup();
});

let keys = 0;
function decide(title: string, body: string) {
	const thread = openDiscussion(
		ana,
		{ title, about: { kind: 'clause', clauseKey: COUNTABLE.key } },
		{ db }
	);
	addProposal(ana, { discussionId: thread.id, body }, { db });
	return freeze(
		ana,
		{
			discussionId: thread.id,
			idempotencyKey: `key-${(keys += 1)}`,
			title,
			type: 'strategic',
			mechanism: 'consent'
		} as Parameters<typeof freeze>[1],
		{ db }
	);
}

describe('the water-pump question', () => {
	it('returns the decision that governs spending', () => {
		const recorded = decide('Spending authority', ADOPTED);

		const found = lookup(ana, QUESTION, { db });

		expect(found.ours.map((hit) => hit.subjectId)).toContain(recorded.id);
		const cited = found.ours.find((hit) => hit.subjectId === recorded.id)!;
		expect(cited.ref).toBe(recorded.ref);
		// The citation is the community's own sentence, not a description of it.
		expect(ADOPTED).toContain(cited.excerpt.replace(/^…|…$/g, ''));
	});

	it('returns the clauses of the standard that use those words', () => {
		const found = lookup(ana, 'consent decision');

		expect(found.clauses.length).toBeGreaterThan(0);
		// Every clause quoted verbatim from the standard this community adopted.
		for (const clause of found.clauses) {
			expect(clause.text).toBe(view.clauseText(view.clause(clause.key)!, 'en').value);
		}
	});

	it('writes no prose of its own', () => {
		const recorded = decide('Spending authority', ADOPTED);
		const found = lookup(ana, QUESTION, { db });

		// Everything the result renders as *content* has to be traceable to a
		// source. Walked rather than enumerated field by field, so a summary added
		// later fails here instead of shipping: an enumerating test would have
		// happily ignored a new one, and this is the promise §1.3 makes.
		const sources = [
			ADOPTED,
			'Spending authority',
			...view.clauses.map((clause) => view.clauseText(clause, 'en').value),
			...view.sections.map((section) => view.localise(section.i18n, 'en').value.title)
		].join('\n');

		/** Identifiers and the member's own words. Everything else is prose. */
		const NOT_CONTENT = new Set([
			'question',
			'terms',
			'ignored',
			'kind',
			'key',
			'ref',
			'sectionKey',
			'definitionId',
			'subjectId',
			'documentId'
		]);

		const check = (value: unknown, key: string | null): void => {
			if (key !== null && NOT_CONTENT.has(key)) return;
			if (Array.isArray(value)) {
				for (const item of value) check(item, key);
			} else if (value && typeof value === 'object') {
				for (const [name, item] of Object.entries(value)) check(item, name);
			} else if (typeof value === 'string' && value.trim()) {
				expect(sources).toContain(value.replace(/^…|…$/g, '').trim());
			}
		};

		check(found, null);
		expect(found.ours.map((hit) => hit.subjectId)).toContain(recorded.id);
	});

	it('behaves identically with no AI provider, because this was never an AI feature', () => {
		decide('Spending authority', ADOPTED);
		const withProvider = lookup(ana, QUESTION, { db });

		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		expect(lookup(ana, QUESTION, { db })).toEqual(withProvider);
	});
});

describe('an empty result is legible', () => {
	it('says which words were searched for', () => {
		const found = lookup(ana, 'Can we keep alpacas?', { db });

		expect(found.ours).toEqual([]);
		// Not "no results". A member can see it looked for "keep" and "alpacas",
		// which is a fact about their governance rather than a broken feature.
		expect(found.terms).toContain('alpacas');
		expect(found.ignored).toContain('we');
	});

	it('searches for nothing when the question is all common words', () => {
		const found = lookup(ana, 'can we do it?', { db });

		expect(found.terms).toEqual([]);
		expect(found.clauses).toEqual([]);
		expect(found.ours).toEqual([]);
	});
});

describe('the register searches through the same seam', () => {
	it('finds a decision by a word its title does not contain', () => {
		const recorded = decide('Spending authority', ADOPTED);

		// The substring scan this replaced could not do this: "circle" appears
		// only in the adopted text, and the ranking is what puts it first.
		const rows = searchDecisions(ana, 'circle', { db });
		expect(rows.map((row) => row.id)).toEqual([recorded.id]);
	});

	it('returns everything when the query is empty', () => {
		decide('Spending authority', ADOPTED);
		expect(searchDecisions(ana, '   ', { db })).toHaveLength(1);
	});

	it('returns nothing rather than everything when nothing matches', () => {
		decide('Spending authority', ADOPTED);
		expect(searchDecisions(ana, 'alpacas', { db })).toEqual([]);
	});
});

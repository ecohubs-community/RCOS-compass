import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setAiProviderForTests, type AiRequest } from '../../src/lib/server/ai/index.js';
import { assistedFindings } from '../../src/lib/server/ai/tasks/lint-definition.js';
import { suggestMappings } from '../../src/lib/server/ai/tasks/map-document.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { community } from '../../src/lib/server/db/schema/tenancy.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { path } from '../../src/lib/server/services/path.js';
import { compliance, readiness } from '../../src/lib/server/services/readiness.js';
import {
	getRiskProfile,
	interview,
	setRiskProfile,
	RISK_QUESTIONS
} from '../../src/lib/server/services/risk-profile.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';
import { eq } from 'drizzle-orm';

/**
 * The interview, and the three places its answers must never go.
 * `design.md` §4, UI spec §4.4.
 *
 * "Do you have children on site?" and "does one person own the property?" are
 * facts about people rather than about governance. They order a list and do
 * nothing else — they are not sent to a model, they do not leave the community,
 * and they move no number anybody is measured by.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

/** Every question answered the way that raises the most. */
const FULLY_ANSWERED = {
	holdsLand: true,
	sharedMoney: true,
	childrenOnSite: true,
	founderOwner: true,
	meets: 'both'
} as const;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let bo: Ctx;

function seed(slug: string, email: string): Ctx {
	const home = makeCommunity(db, { slug });
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
	const person = makeUser(db, { email });
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
	ana = seed('valle-verde', 'ana@example.org');
	bo = seed('other-place', 'bo@example.org');

	const member = makeUser(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, ana.community.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setAiProviderForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	setDbForTests(null);
	cleanup();
});

const keys = (ctx: Ctx) => path(ctx, { db }).map((item) => item.sectionKey);

describe('every question moves what it says it moves', () => {
	it('names sections a member can go and read', () => {
		const questions: ReturnType<typeof interview> = interview(view);
		expect(questions).toHaveLength(RISK_QUESTIONS.length);

		for (const question of questions) {
			// At least one answer changes something: a question that changes nothing
			// teaches people the interview is decoration.
			expect(question.answers.some((answer) => answer.moves.length > 0)).toBe(true);
			for (const answer of question.answers) {
				for (const move of answer.moves) {
					// A title, not the key. "Three requirements move up" is a claim
					// nobody can check; "Spending Authority" is one they can read.
					expect(move.title).not.toBe(move.key);
					expect(move.title.length).toBeGreaterThan(0);
				}
			}
		}
	});

	it('adds weight to exactly the sections it named, and takes none from anything', () => {
		for (const question of RISK_QUESTIONS) {
			for (const answer of question.answers) {
				if (answer.raises.length === 0) continue;

				db.delete(community).where(eq(community.id, ana.community.id)).run();
				ana = seed('valle-verde', `ana-${question.id}-${answer.value}@example.org`);

				const before = path(ana, { db });
				setRiskProfile(
					ana,
					{ [question.id]: question.id === 'meets' ? answer.value : answer.value === 'yes' },
					{ db }
				);
				const after = path(ana, { db });

				const named = new Set(answer.raises);
				for (const item of after) {
					const was = before.find((row) => row.sectionKey === item.sectionKey)!;
					const label = `${question.id}=${answer.value} · ${item.sectionKey}`;

					if (named.has(item.sectionKey)) {
						expect(item.contributions.risk.points, label).toBeGreaterThan(0);
						expect(item.reason, label).toContain('answers about the community');
						expect(item.score, label).toBeGreaterThan(was.score);
						expect(after.indexOf(item), label).toBeLessThanOrEqual(before.indexOf(was));
					} else {
						// Everything else is untouched, not merely relatively lower. An
						// answer adds weight to what it named and does nothing else.
						expect(item.contributions.risk.points, label).toBe(0);
						expect(item.score, label).toBe(was.score);
					}
				}

				// Nothing joined or left the list; an answer reorders and does no more.
				expect(after.map((item) => item.sectionKey).sort()).toEqual(
					before.map((item) => item.sectionKey).sort()
				);
			}
		}
	});

	it('changes the order a community actually sees', () => {
		// Asserting a moved position for *every* answer is not possible on a
		// day-one list and would be a worse test for pretending otherwise: the
		// four sections `founderOwner` names are already the top of their layer,
		// so the answer confirms the structural order rather than disturbing it.
		// What must be true is that the interview as a whole is not decoration.
		const structural = keys(ana);
		setRiskProfile(ana, FULLY_ANSWERED, { db });
		expect(keys(ana)).not.toEqual(structural);
	});
});

describe('answering it changes the order and nothing else', () => {
	function adoptSomething() {
		const thread = openDiscussion(
			ana,
			{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: COUNTABLE.key } },
			{ db }
		);
		addProposal(ana, { discussionId: thread.id, body: 'A member may leave at any time.' }, { db });
		freeze(
			ana,
			{
				discussionId: thread.id,
				idempotencyKey: 'k1',
				title: 'Exit and separation',
				type: 'strategic',
				mechanism: 'consent'
			} as Parameters<typeof freeze>[1],
			{ db }
		);
	}

	it('leaves readiness and the compliance claim exactly where they were', () => {
		adoptSomething();
		const before = { readiness: readiness(ana, { db }), compliance: compliance(ana, { db }) };

		setRiskProfile(ana, FULLY_ANSWERED, { db });

		// The number a community is measured by cannot move because of a fact about
		// its people. If it could, answering the interview would be a way to look
		// more compliant, which is the incentive RCOS exists to remove.
		expect(readiness(ana, { db })).toEqual(before.readiness);
		expect(compliance(ana, { db })).toEqual(before.compliance);
	});

	it('is editable, and un-answering puts the order back', () => {
		const structural = keys(ana);

		setRiskProfile(ana, { holdsLand: true }, { db });
		expect(keys(ana)).not.toEqual(structural);

		// Null is "not answered", which is a different thing from "no" — the same
		// distinction the definition draft had to learn.
		setRiskProfile(ana, { holdsLand: null }, { db });
		expect(keys(ana)).toEqual(structural);
	});

	it('keeps the answers somebody did not touch', () => {
		setRiskProfile(ana, { holdsLand: true, sharedMoney: true }, { db });
		setRiskProfile(ana, { childrenOnSite: false }, { db });

		const profile = getRiskProfile(ana, { db })!;
		expect(profile.holdsLand).toBe(true);
		expect(profile.sharedMoney).toBe(true);
		expect(profile.childrenOnSite).toBe(false);
		expect(profile.founderOwner).toBeNull();
	});

	it('is refused for a member', () => {
		expect(catchRefusal(() => setRiskProfile(lena, { holdsLand: true }, { db }))?.status).toBe(403);
	});
});

describe('the answers stay inside the community', () => {
	it('is invisible to another community, exactly as if it did not exist', () => {
		setRiskProfile(ana, FULLY_ANSWERED, { db });

		// Not "refused" — the same answer as for a community that never answered.
		// A refusal would itself say that community A has a profile.
		expect(getRiskProfile(bo, { db })).toBeNull();
		expect(keys(bo)).toEqual(keys({ ...bo } as Ctx));
	});

	it("changes no other community's ordering", () => {
		const theirs = keys(bo);
		setRiskProfile(ana, FULLY_ANSWERED, { db });
		expect(keys(bo)).toEqual(theirs);
	});

	it("reaches no AI task's input", async () => {
		vi.stubEnv('AI_PROVIDER', 'fixture');
		resetConfigForTests();
		db.update(community).set({ aiEnabled: true }).where(eq(community.id, ana.community.id)).run();
		const on = { ...ana, community: { ...ana.community, aiEnabled: true } } as Ctx;

		const sent: AiRequest[] = [];
		setAiProviderForTests({
			id: 'recording',
			complete(request) {
				sent.push(request);
				return Promise.resolve({
					ok: true as const,
					text: '{}',
					usage: { in: 1, out: 1 },
					model: 'recording'
				});
			}
		});

		const run = async () => {
			await assistedFindings(on, { body: 'A member may leave at any time.', type: null }, { db });
			await suggestMappings(
				on,
				{
					passages: [
						{ id: 'p1', text: 'We hold the land in common.', kind: 'paragraph', under: null }
					],
					requirements: [{ key: COUNTABLE.key, ref: COUNTABLE.ref, asks: 'Who may leave?' }]
				},
				{ db }
			);
		};

		await run();
		const withoutProfile = sent.splice(0).map((request) => JSON.stringify(request));

		setRiskProfile(on, FULLY_ANSWERED, { db });
		await run();
		const withProfile = sent.splice(0).map((request) => JSON.stringify(request));

		// Byte-identical. Asserting that some particular word is absent would only
		// catch the leak somebody thought of; this catches any of them, including
		// one added by a task written next year.
		expect(withProfile).toEqual(withoutProfile);
		expect(withProfile).toHaveLength(2);
	});
});

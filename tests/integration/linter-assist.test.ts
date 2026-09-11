import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { community } from '../../src/lib/server/db/schema/tenancy.js';
import { setAiProviderForTests, type AiProvider } from '../../src/lib/server/ai/index.js';
import { allFindings } from '../../src/lib/shared/linter.js';
import { lint } from '../../src/lib/server/linter/index.js';
import { ASSIST_UNAVAILABLE, lintWithAssist } from '../../src/lib/server/services/linting.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The linter's second half. docs/11-definition-linter.md §8.
 *
 * The promise being kept here: the rule-based rules run with `AI_PROVIDER=null`,
 * and the two assisted rules **degrade to silence, never to a guess**. A check
 * that did not happen must never look like a check that passed — a community
 * that believes their text was examined when it was not is worse off than one
 * told plainly that it was not.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

/**
 * A line that binds nobody and names no process — the guide's anti-pattern, now
 * without a label because nobody applies one. The rule set places it nowhere;
 * the assisted half is the part that can say what it reads as.
 */
const ANTI_PATTERN = {
	body: 'Diversity is valued here.',
	plainLanguage: 'In practice: we care about it.',
	locale: 'en'
};

const modelSaying = (text: string): AiProvider => ({
	id: 'fixture',
	complete: async () => ({
		ok: true,
		text,
		usage: { in: 10, out: 10 },
		model: 'test-model'
	})
});

const JUDGEMENT = JSON.stringify({
	auditable: false,
	auditableWhy: 'There is nothing somebody could point at to show it was done.',
	readsAs: 'expressive',
	readsAsWhy: 'It states something the community cares about, and binds nobody.'
});

let db: Db;
let cleanup: () => void;
let ctx: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	vi.stubEnv('AI_PROVIDER', 'fixture');
	resetConfigForTests();

	const place = makeCommunity(db, { slug: 'valle-verde' });
	const person = makeUser(db, { email: 'ana@example.org' });
	db.update(community).set({ aiEnabled: true }).where(eq(community.id, place.id)).run();
	ctx = {
		user: person,
		community: { ...place, aiEnabled: true },
		membership: makeMembership(db, place.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
});

afterEach(() => {
	setDbForTests(null);
	setAiProviderForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	cleanup();
});

const rules = (findings: { rule: string }[]) => findings.map((finding) => finding.rule);

describe('the rule set is the same with a provider and without one', () => {
	it('produces identical rule-based findings either way', async () => {
		const alone = lint(ANTI_PATTERN);

		setAiProviderForTests(modelSaying(JUDGEMENT));
		const assisted = await lintWithAssist(ctx, ANTI_PATTERN, { db });

		// Every rule-based finding, unchanged. The AI half adds; it never edits,
		// reorders or suppresses — and its findings join the *body's* list, since
		// they read the text whole and have no sentence to point at.
		expect(assisted.lines).toEqual(alone.lines);
		expect(assisted.bodyFindings.slice(0, alone.bodyFindings.length)).toEqual(alone.bodyFindings);
	});

	it('runs the whole rule set with no provider at all', async () => {
		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		const result = await lintWithAssist(ctx, ANTI_PATTERN, { db });

		// The rules that matter most are word-and-shape rules, and they are a
		// product promise rather than an AI feature. Every one of them still fires.
		// Every rule-based finding survives, and the notice joins them. Compared as
		// a set: the assisted notice lands among the body's findings, which come
		// before the per-line ones.
		expect(rules(allFindings(result)).sort()).toEqual(
			[...rules(allFindings(lint(ANTI_PATTERN))), ASSIST_UNAVAILABLE].sort()
		);
		// Not `enf.subject`: nothing here binds anybody, so the enforceable checks
		// correctly never ran. The rule that fires is the one that should — a line
		// doing no job at all.
		expect(rules(allFindings(result))).toContain('line.clutter');
		expect(result.assisted).toBe(false);
	});
});

describe('a check that did not run says so', () => {
	it('reports the two assisted checks as not run when there is no provider', async () => {
		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		const result = await lintWithAssist(ctx, ANTI_PATTERN, { db });
		const notice = allFindings(result).find((finding) => finding.rule === ASSIST_UNAVAILABLE)!;

		expect(notice).toBeDefined();
		expect(notice.message).toMatch(/were not run/);
		// Never as a passing check: an "ok" here would tell a community their text
		// had been examined for something nobody examined it for.
		expect(notice.severity).toBe('note');
		expect(rules(allFindings(result))).not.toContain('enf.auditable');
	});

	it('says the same when the community has not switched AI on', async () => {
		const off: Ctx = { ...ctx, community: { ...ctx.community, aiEnabled: false } };
		setAiProviderForTests(modelSaying(JUDGEMENT));

		const result = await lintWithAssist(off, ANTI_PATTERN, { db });
		expect(rules(allFindings(result))).toContain(ASSIST_UNAVAILABLE);
		expect(result.assisted).toBe(false);
	});

	it('says the same when the member has spent their budget', async () => {
		vi.stubEnv('AI_USER_DAILY_TASKS', '1');
		resetConfigForTests();
		setAiProviderForTests(modelSaying(JUDGEMENT));

		await lintWithAssist(ctx, ANTI_PATTERN, { db });
		const second = await lintWithAssist(ctx, ANTI_PATTERN, { db });

		expect(rules(allFindings(second))).toContain(ASSIST_UNAVAILABLE);
		const notice = allFindings(second).find((f) => f.rule === ASSIST_UNAVAILABLE)!;
		expect(notice.message).toMatch(/budget for today/);
	});

	it('says the same when the model answers with something unusable', async () => {
		// Silence, never a guess. Prose where JSON was asked for is no answer.
		setAiProviderForTests(modelSaying('I would say this is probably fine, honestly.'));

		const result = await lintWithAssist(ctx, ANTI_PATTERN, { db });
		expect(rules(allFindings(result))).toContain(ASSIST_UNAVAILABLE);
		expect(rules(allFindings(result))).not.toContain('enf.auditable');
	});

	it('does not make a definition unclean by failing to check it', async () => {
		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		const clean = {
			body: 'Transparency over control, by default; an override is recorded with its reason.',
			plainLanguage: 'In practice: we share things unless there is a written reason not to.',
			locale: 'en'
		};
		const result = await lintWithAssist(ctx, clean, { db });

		expect(rules(allFindings(result))).toContain(ASSIST_UNAVAILABLE);
		expect(result.clean).toBe(lint(clean).clean);
	});
});

describe('the two assisted rules, when they do run', () => {
	it('asks what an auditor would look at — RCOS §2.4.3', async () => {
		setAiProviderForTests(modelSaying(JUDGEMENT));

		const result = await lintWithAssist(ctx, ANTI_PATTERN, { db });
		const auditable = allFindings(result).find((f) => f.rule === 'enf.auditable')!;

		expect(auditable.severity).toBe('blocker_shaped');
		expect(auditable.message).toMatch(/could not check this yes or no/);
		// And it says why, because a finding nobody can argue with is one people
		// learn to ignore.
		expect(auditable.message).toMatch(/nothing somebody could point at/);
		expect(result.assisted).toBe(true);
	});

	it('reports an affirmative check too', async () => {
		setAiProviderForTests(
			modelSaying(
				JSON.stringify({
					auditable: true,
					auditableWhy: 'It names who decides and what happens if they do not.',
					readsAs: 'enforceable',
					readsAsWhy: 'It binds the assembly to a process.'
				})
			)
		);

		const result = await lintWithAssist(
			ctx,
			{
				body: 'A candidate is admitted by a consent decision of the assembly. Otherwise they remain a candidate.',
				plainLanguage: 'In practice: the assembly confirms you, or you stay a candidate.',
				locale: 'en'
			},
			{ db }
		);

		const auditable = allFindings(result).find((f) => f.rule === 'enf.auditable')!;
		expect(auditable.severity).toBe('ok');
	});

	it('names what the text reads as when that is not what it is labelled', async () => {
		setAiProviderForTests(
			modelSaying(
				JSON.stringify({
					auditable: true,
					auditableWhy: 'It names a process.',
					readsAs: 'interpretive',
					readsAsWhy: 'It weighs one thing against another rather than binding anybody.'
				})
			)
		);

		const result = await lintWithAssist(
			ctx,
			{
				// The rule set reads this as enforceable; the model reads it as
				// interpretive. Two readings, and the finding names both.
				body: 'A member is removed by a consent decision of the assembly, otherwise they remain a member.',
				locale: 'en'
			},
			{ db }
		);

		const mismatch = allFindings(result).find((f) => f.rule === 'type.mismatch')!;
		expect(mismatch.message).toMatch(
			/reads this as enforceable; a closer look reads it as interpretive/
		);
	});

	it('stays quiet when the model is unsure of the type', async () => {
		// A shrug is not a finding. "unclear" costs a member attention and tells
		// them nothing they can act on.
		setAiProviderForTests(
			modelSaying(
				JSON.stringify({
					auditable: true,
					auditableWhy: 'It names a process.',
					readsAs: 'unclear',
					readsAsWhy: 'It could be read either way.'
				})
			)
		);

		const result = await lintWithAssist(
			ctx,
			{ body: 'A member is admitted by the assembly, or remains a candidate.', locale: 'en' },
			{ db }
		);
		expect(rules(allFindings(result))).not.toContain('type.mismatch');
	});

	it('does not report one problem twice', async () => {
		// The rule set already catches obligation words under an aspirational
		// label. Two findings with the same rule read as two problems.
		setAiProviderForTests(
			modelSaying(
				JSON.stringify({
					auditable: false,
					auditableWhy: 'Nothing to point at.',
					readsAs: 'enforceable',
					readsAsWhy: 'It uses the word must.'
				})
			)
		);

		const result = await lintWithAssist(
			ctx,
			// The rule set reads this as nothing it can place and reports the
			// ambiguous middle; the model reads it as enforceable. One `type.mismatch`
			// at most, whatever the two halves think.
			{ body: 'Members are expected to show up with humility.', locale: 'en' },
			{ db }
		);

		expect(
			rules(allFindings(result)).filter((rule) => rule === 'type.mismatch').length
		).toBeLessThanOrEqual(1);
	});
});

describe('the linter is still advice', () => {
	it('cannot stop a freeze, whatever the assisted rules say', async () => {
		setAiProviderForTests(modelSaying(JUDGEMENT));
		const result = await lintWithAssist(ctx, ANTI_PATTERN, { db });

		// It returns a verdict and no more. `freeze()` never asks the linter, which
		// is why a community may adopt a definition it dislikes and have the
		// disagreement stored with the version. Nothing here is a gate, a veto or
		// a status anything else reads.
		expect(result.clean).toBe(false);
		expect(Object.keys(result).sort()).toEqual([
			'assisted',
			'bodyFindings',
			'clean',
			'lines',
			'primaryJob',
			'ranAt',
			'shape'
		]);
	});
});

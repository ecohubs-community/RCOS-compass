import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { aiCall, aiUsage } from '../../src/lib/server/db/schema/ai.js';
import { community } from '../../src/lib/server/db/schema/tenancy.js';
import {
	fixtureProvider,
	setAiProviderForTests,
	type AiProvider,
	type AiRequest
} from '../../src/lib/server/ai/index.js';
import { aiAvailability, budgetFor, runAiTask } from '../../src/lib/server/ai/run.js';
import {
	aiSettings,
	setAiEnabled,
	usageByMember
} from '../../src/lib/server/services/ai-settings.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The seam: who may spend, what it costs, and what is written down.
 * docs/00-architecture.md §4, docs/04-security.md §5.3.
 *
 * The property worth breaking this suite over is that **one member cannot spend
 * everybody else's month**. Everything else here is arithmetic; that one is why
 * the per-user limit is the control and the community budget is the backstop.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

const REQUEST: AiRequest = {
	task: 'map-document',
	system: 'you map passages to clauses',
	input: 'A member may leave at any time.',
	maxOutputTokens: 256
};

/** A provider that always answers, and always costs the same. */
const spender = (perCall = 100): AiProvider => ({
	id: 'fixture',
	complete: async () => ({
		ok: true,
		text: '[]',
		usage: { in: perCall / 2, out: perCall / 2 },
		model: 'test-model'
	})
});

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;

function enableAi(ctx: Ctx) {
	db.update(community).set({ aiEnabled: true }).where(eq(community.id, ctx.community.id)).run();
	return { ...ctx, community: { ...ctx.community, aiEnabled: true } };
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	vi.stubEnv('AI_PROVIDER', 'fixture');
	resetConfigForTests();

	const place = makeCommunity(db, { slug: 'valle-verde', timezone: 'America/Guayaquil' });
	const first = makeUser(db, { email: 'ana@example.org' });
	const second = makeUser(db, { email: 'lena@example.org' });
	ana = {
		user: first,
		community: place,
		membership: makeMembership(db, place.id, first.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
	lena = {
		...ana,
		user: second,
		membership: makeMembership(db, place.id, second.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	setAiProviderForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	cleanup();
});

describe('AI is off until a community turns it on', () => {
	it('is off for a community nobody has switched it on for', () => {
		setAiProviderForTests(spender());
		const refusal = aiAvailability(ana, { db })!;

		expect(refusal.ok).toBe(false);
		expect(refusal.ok === false && refusal.reason).toMatch(/not switched on/);
		expect(aiSettings(ana, { db }).enabled).toBe(false);
	});

	it('is a steward-s act to switch on', () => {
		expect(catchRefusal(() => setAiEnabled(lena, true, { db }))?.status).toBe(403);

		setAiEnabled(ana, true, { db });
		expect(db.select().from(community).all()[0]!.aiEnabled).toBe(true);
	});

	it('refuses to switch on what the instance does not have', () => {
		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		// Otherwise a community would turn on a feature, see nothing happen, and
		// have no way to tell whether it was them or us.
		expect(catchRefusal(() => setAiEnabled(ana, true, { db }))?.status).toBe(409);
	});

	it('stays unavailable when the instance has no provider, whatever the flag says', () => {
		const on = enableAi(ana);
		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		expect(aiAvailability(on, { db })?.ok).toBe(false);
	});
});

describe('what a call costs, and what is written down', () => {
	it('logs the task, the model and the tokens', async () => {
		const on = enableAi(ana);
		setAiProviderForTests(spender(100));

		const result = await runAiTask(on, REQUEST, { db });
		expect(result.ok).toBe(true);

		const [logged] = db.select().from(aiCall).all();
		expect(logged!.task).toBe('map-document');
		expect(logged!.model).toBe('test-model');
		expect(logged!.tokensIn + logged!.tokensOut).toBe(100);
		expect(logged!.ok).toBe(true);
	});

	it('logs a hash of the input and never the input', async () => {
		const on = enableAi(ana);
		setAiProviderForTests(spender());

		await runAiTask(on, REQUEST, { db });

		const [logged] = db.select().from(aiCall).all();
		// Governance drafts are among the most sensitive text a community holds.
		// A log that keeps them is a second copy outside every control we have.
		expect(logged!.inputSha256).toHaveLength(64);
		expect(JSON.stringify(logged)).not.toContain('A member may leave');
	});

	it('logs a failure with the same fields, marked not ok', async () => {
		const on = enableAi(ana);
		setAiProviderForTests(fixtureProvider({}));

		const result = await runAiTask(on, REQUEST, { db });
		expect(result.ok).toBe(false);

		const [logged] = db.select().from(aiCall).all();
		expect(logged!.ok).toBe(false);
		expect(logged!.detail).toMatch(/No fixture recorded/);
	});

	it('counts against the member and the community together', async () => {
		const on = enableAi(ana);
		setAiProviderForTests(spender(100));

		await runAiTask(on, REQUEST, { db });

		const rows = db.select().from(aiUsage).all();
		// One row for the member, one for the community — which makes "everyone's
		// spending" a sum over a column rather than a join.
		expect(rows).toHaveLength(2);
		expect(rows.every((row) => row.tokens === 100)).toBe(true);
		expect(rows.filter((row) => row.actorId === null)).toHaveLength(1);
	});
});

describe('one member cannot spend everybody else-s month', () => {
	it('stops the member at their daily task limit, and nobody else', async () => {
		vi.stubEnv('AI_USER_DAILY_TASKS', '2');
		resetConfigForTests();

		const anaOn = enableAi(ana);
		const lenaOn = { ...lena, community: anaOn.community };
		setAiProviderForTests(spender(10));

		await runAiTask(anaOn, REQUEST, { db });
		await runAiTask(anaOn, REQUEST, { db });

		const refused = await runAiTask(anaOn, REQUEST, { db });
		expect(refused.ok).toBe(false);
		expect(refused.ok === false && refused.reason).toMatch(/budget for today/);
		// And it names the manual path, because that is what to do next.
		expect(refused.ok === false && refused.reason).toMatch(/by hand/);

		// Lena's afternoon is unaffected. This is the whole reason the per-user
		// limit is the control rather than the community budget.
		const hers = await runAiTask(lenaOn, REQUEST, { db });
		expect(hers.ok).toBe(true);
	});

	it('stops everybody at the community ceiling', async () => {
		vi.stubEnv('AI_MONTHLY_TOKEN_BUDGET', '150');
		resetConfigForTests();

		const anaOn = enableAi(ana);
		const lenaOn = { ...lena, community: anaOn.community };
		setAiProviderForTests(spender(100));

		await runAiTask(anaOn, REQUEST, { db });

		const refused = await runAiTask(lenaOn, REQUEST, { db });
		expect(refused.ok).toBe(false);
		expect(refused.ok === false && refused.reason).toMatch(/community has used its AI budget/);
	});

	it('honours a ceiling set for this community over the instance default', async () => {
		vi.stubEnv('AI_MONTHLY_TOKEN_BUDGET', '1000000');
		resetConfigForTests();
		db.update(community)
			.set({ aiEnabled: true, aiMonthlyTokens: 50 })
			.where(eq(community.id, ana.community.id))
			.run();
		const on: Ctx = {
			...ana,
			community: { ...ana.community, aiEnabled: true, aiMonthlyTokens: 50 }
		};
		setAiProviderForTests(spender(100));

		await runAiTask(on, REQUEST, { db });
		const refused = await runAiTask(on, REQUEST, { db });
		expect(refused.ok).toBe(false);
	});

	it('does not spend anything to refuse', async () => {
		vi.stubEnv('AI_USER_DAILY_TASKS', '1');
		resetConfigForTests();

		const on = enableAi(ana);
		setAiProviderForTests(spender(100));
		await runAiTask(on, REQUEST, { db });
		await runAiTask(on, REQUEST, { db });

		// The refusal happens before the provider is called, so it costs nothing
		// and is not logged as a call that happened.
		expect(db.select().from(aiCall).all()).toHaveLength(1);
	});
});

describe('usage is visible, because an invisible quota looks like a bug', () => {
	it('shows a member their own spending', async () => {
		const on = enableAi(ana);
		setAiProviderForTests(spender(100));
		await runAiTask(on, REQUEST, { db });

		const budget = budgetFor(on, { db });
		expect(budget.tasksToday).toBe(1);
		expect(budget.tokensThisMonth).toBe(100);
	});

	it('shows a steward the spending per member', async () => {
		const anaOn = enableAi(ana);
		const lenaOn = { ...lena, community: anaOn.community };
		setAiProviderForTests(spender(100));
		await runAiTask(anaOn, REQUEST, { db });
		await runAiTask(lenaOn, REQUEST, { db });
		await runAiTask(lenaOn, REQUEST, { db });

		const rows = usageByMember(anaOn, { db });
		expect(rows).toHaveLength(2);
		expect(rows[0]!.email).toBe('lena@example.org');
		expect(rows[0]!.tokens).toBe(200);
	});

	it('does not show a member everybody else-s', () => {
		const on = { ...lena, community: enableAi(ana).community };
		expect(catchRefusal(() => usageByMember(on, { db }))?.status).toBe(403);
	});
});

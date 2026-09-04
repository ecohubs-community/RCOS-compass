import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Ctx } from '../auth/guard.js';
import { can } from '../auth/permissions.js';
import { getConfig } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { aiCall, aiUsage } from '../db/schema/ai.js';
import { getAiProvider } from './index.js';
import { NO_PROVIDER, unavailable, type AiRequest, type AiResult } from './provider.js';

/**
 * Running an AI task: what it costs, who is allowed to spend it, and what is
 * written down afterwards. docs/00-architecture.md §4, docs/04-security.md §5.3.
 *
 * Everything an AI task does goes through here, and here writes to exactly two
 * tables — the call log and the usage counter. That is the whole of what the
 * `ai/` directory may touch, enforced by the import boundary rather than by
 * anybody remembering. A task *returns* data; an ordinary service with a `Ctx`
 * and a permission check turns it into a suggestion row a person confirms.
 *
 * The budget order matters: **per member first, community second.** One
 * enthusiastic person must not be able to spend everyone else's month, so the
 * per-user limit is the control and the community budget is the backstop —
 * not the other way round.
 */

/** `YYYY-MM-DD` and `YYYY-MM` in the community's own timezone. */
function periodsOf(now: number, timeZone: string): { day: string; month: string } {
	const day = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(now));
	return { day, month: day.slice(0, 7) };
}

export type Budget = {
	tasksToday: number;
	tasksPerDay: number;
	tokensThisMonth: number;
	tokensPerMonth: number;
	communityTokensThisMonth: number;
	communityTokensPerMonth: number;
};

/** What a member has spent, and what they are allowed. Their own, and theirs only. */
export function budgetFor(ctx: Ctx, options: { db?: Db } = {}): Budget {
	const db = options.db ?? getDb();
	const config = getConfig();
	const { day, month } = periodsOf(ctx.now(), ctx.community.timezone);

	const sum = (where: ReturnType<typeof and>) => {
		const [row] = db
			.select({
				tasks: sql<number>`coalesce(sum(${aiUsage.tasks}), 0)`,
				tokens: sql<number>`coalesce(sum(${aiUsage.tokens}), 0)`
			})
			.from(aiUsage)
			.where(where)
			.all();
		return { tasks: row?.tasks ?? 0, tokens: row?.tokens ?? 0 };
	};

	const mineToday = sum(
		and(
			eq(aiUsage.communityId, ctx.community.id),
			eq(aiUsage.actorId, ctx.user.id),
			eq(aiUsage.periodDay, day)
		)
	);
	const mineThisMonth = sum(
		and(
			eq(aiUsage.communityId, ctx.community.id),
			eq(aiUsage.actorId, ctx.user.id),
			eq(aiUsage.periodMonth, month)
		)
	);
	const community = sum(
		and(eq(aiUsage.communityId, ctx.community.id), eq(aiUsage.periodMonth, month))
	);

	return {
		tasksToday: mineToday.tasks,
		tasksPerDay: config.AI_USER_DAILY_TASKS,
		tokensThisMonth: mineThisMonth.tokens,
		tokensPerMonth: config.AI_USER_MONTHLY_TOKENS,
		communityTokensThisMonth: community.tokens,
		// A community may be given its own ceiling; otherwise the instance default.
		communityTokensPerMonth: ctx.community.aiMonthlyTokens ?? config.AI_MONTHLY_TOKEN_BUDGET
	};
}

/**
 * May this member run an AI task right now?
 *
 * Answers with the same `AiResult` shape a provider does, so a caller has one
 * case to handle whether the reason is "no provider", "your community has not
 * switched it on", "you have used today's allowance" or "the model failed".
 */
export function aiAvailability(ctx: Ctx, options: { db?: Db } = {}): AiResult | null {
	const config = getConfig();

	if (config.AI_PROVIDER === 'null') return unavailable(NO_PROVIDER);

	// Off until a community turns it on. A new community has it off, and turning
	// it on is a deliberate act on a screen that names the provider.
	if (!ctx.community.aiEnabled) return unavailable(NO_PROVIDER);

	if (!can({ role: ctx.membership.role, isOwner: ctx.membership.isOwner }, 'ai.run')) {
		return unavailable('You do not have permission to run AI tasks in this community.');
	}

	const budget = budgetFor(ctx, options);

	if (budget.tasksPerDay > 0 && budget.tasksToday >= budget.tasksPerDay) {
		return unavailable(
			'You have used your AI budget for today. Everything still works without it; mapping and linting can be done by hand.',
			{ retryable: true }
		);
	}
	if (budget.tokensPerMonth > 0 && budget.tokensThisMonth >= budget.tokensPerMonth) {
		return unavailable(
			'You have used your AI budget for this month. Everything still works without it; mapping and linting can be done by hand.'
		);
	}
	if (
		budget.communityTokensPerMonth > 0 &&
		budget.communityTokensThisMonth >= budget.communityTokensPerMonth
	) {
		return unavailable(
			'This community has used its AI budget for the month. Mapping and linting can still be done by hand.'
		);
	}

	return null;
}

/**
 * Run one task: check, call, record.
 *
 * The counter is incremented **after** the call with the tokens actually spent,
 * rather than reserving them beforehand. A reservation is more accurate and
 * leaks whenever a process dies mid-task; an underestimate costs at most one
 * call's overshoot, and the counter is never wrong in the direction that lets
 * somebody keep going.
 */
export async function runAiTask(
	ctx: Ctx,
	request: AiRequest,
	options: { db?: Db } = {}
): Promise<AiResult> {
	const db = options.db ?? getDb();

	const refusal = aiAvailability(ctx, { db });
	if (refusal) return refusal;

	const provider = getAiProvider();
	const startedAt = Date.now();
	const result = await provider.complete(request);
	const ms = Date.now() - startedAt;

	record(db, ctx, {
		task: request.task,
		model: result.model,
		usage: result.usage,
		ms,
		ok: result.ok,
		// The member's sentence, not the model's output. Never the input.
		detail: result.ok ? null : result.reason,
		input: request.input
	});

	return result;
}

/**
 * The log and the counter, written together.
 *
 * A hash of the input and never the input itself: governance drafts are among
 * the most sensitive text a community holds, and a log that keeps them is a
 * second copy sitting outside every control the application has.
 */
function record(
	db: Db,
	ctx: Ctx,
	entry: {
		task: string;
		model: string;
		usage: { in: number; out: number };
		ms: number;
		ok: boolean;
		detail: string | null;
		input: string;
	}
): void {
	const now = ctx.now();
	const { day, month } = periodsOf(now, ctx.community.timezone);
	const tokens = entry.usage.in + entry.usage.out;

	db.transaction((tx) => {
		tx.insert(aiCall)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				actorId: ctx.user.id,
				task: entry.task,
				model: entry.model,
				tokensIn: entry.usage.in,
				tokensOut: entry.usage.out,
				ms: entry.ms,
				inputSha256: createHash('sha256').update(entry.input).digest('hex'),
				ok: entry.ok,
				detail: entry.detail,
				createdAt: new Date(now)
			})
			.run();

		// Two rows: the member's, and the community's. The community row carries a
		// null actor, which is what makes "everyone's spending" a sum over one
		// column rather than a join.
		for (const actorId of [ctx.user.id, null]) {
			tx.insert(aiUsage)
				.values({
					communityId: ctx.community.id,
					actorId,
					periodDay: day,
					periodMonth: month,
					tasks: 1,
					tokens
				})
				.onConflictDoUpdate({
					target: [aiUsage.communityId, aiUsage.actorId, aiUsage.periodDay, aiUsage.periodMonth],
					set: {
						tasks: sql`${aiUsage.tasks} + 1`,
						tokens: sql`${aiUsage.tokens} + ${tokens}`
					}
				})
				.run();
		}
	});
}

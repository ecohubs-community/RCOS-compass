import { desc, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getConfig } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { aiUsage } from '../db/schema/ai.js';
import { membership } from '../db/schema/tenancy.js';
import { user } from '../db/schema/auth.js';
import { budgetFor } from '../ai/run.js';
import { community } from '../db/schema/tenancy.js';

/**
 * Turning AI on, and seeing what it costs. docs/00-architecture.md §4 rule 4,
 * docs/04-security.md §5.3.
 *
 * This is a *service*, not part of `src/lib/server/ai/` — the AI module may not
 * write community state, and switching a community's flag is exactly that. The
 * boundary is the point: the seam runs models and logs what they cost, and
 * everything else about them is ordinary application code with a permission
 * check.
 *
 * Usage is visible to the member for themselves and to stewards per member,
 * because an invisible quota is indistinguishable from a bug.
 */

export type AiSettings = {
	/** Whether the instance has a provider at all. */
	providerConfigured: boolean;
	providerName: string;
	enabled: boolean;
	budget: ReturnType<typeof budgetFor>;
};

export function aiSettings(ctx: Ctx, options: { db?: Db } = {}): AiSettings {
	requirePermission(ctx, 'community.read');
	const config = getConfig();

	return {
		providerConfigured: config.AI_PROVIDER !== 'null',
		providerName: config.AI_PROVIDER,
		enabled: ctx.community.aiEnabled,
		budget: budgetFor(ctx, options)
	};
}

/**
 * Switch it on, or off.
 *
 * A steward's act, on a screen that names the provider and states its data
 * terms — governance drafts are among the most sensitive text a community
 * holds, and some hosted tiers reserve the right to train on what they are
 * sent. Nobody should discover after the fact that their bylaws went somewhere.
 */
export function setAiEnabled(ctx: Ctx, enabled: boolean, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	if (enabled && getConfig().AI_PROVIDER === 'null') {
		error(409, 'This instance has no AI provider configured, so there is nothing to switch on.');
	}

	db.update(community)
		.set({ aiEnabled: enabled, updatedAt: new Date(ctx.now()) })
		.where(eq(community.id, ctx.community.id))
		.run();
}

export type MemberUsage = { email: string; tasks: number; tokens: number };

/** What each member has spent this month. A steward's view. */
export function usageByMember(ctx: Ctx, options: { db?: Db } = {}): MemberUsage[] {
	requirePermission(ctx, 'settings.manage');
	const db = options.db ?? getDb();
	const month = budgetMonth(ctx);

	return db
		.select({
			email: user.email,
			tasks: sql<number>`coalesce(sum(${aiUsage.tasks}), 0)`,
			tokens: sql<number>`coalesce(sum(${aiUsage.tokens}), 0)`
		})
		.from(aiUsage)
		.innerJoin(user, eq(user.id, aiUsage.actorId))
		.innerJoin(membership, eq(membership.userId, user.id))
		.where(sql`${aiUsage.communityId} = ${ctx.community.id} and ${aiUsage.periodMonth} = ${month}`)
		.groupBy(user.email)
		.orderBy(desc(sql`sum(${aiUsage.tokens})`))
		.all();
}

function budgetMonth(ctx: Ctx): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: ctx.community.timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	})
		.format(new Date(ctx.now()))
		.slice(0, 7);
}

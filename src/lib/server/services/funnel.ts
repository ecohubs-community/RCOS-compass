import { eq, inArray } from 'drizzle-orm';
import { getConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { funnelEvent } from '../db/schema/operations.js';

/**
 * Does onboarding work? `docs/00-architecture.md` §12.
 *
 * The document is blunt about the trade: a privacy-first product has no
 * third-party analytics, no session recording and no tracking cookies — and
 * shipping onboarding blind is also a choice, and a bad one. The middle path is
 * seven counters in our own database.
 *
 * **They are milestones, not volumes.** A community adopts its first definition
 * once; the row records that it happened and nothing about who did it, when in
 * their session, or from which page. The unique index is the enforcement rather
 * than the intention: there is no second row to write, so this cannot quietly
 * become a behavioural log. Adding a member id would be a schema change and a
 * review, which is the point.
 */
export const MILESTONES = [
	'community.created',
	'interview.completed',
	'document.uploaded',
	'mapping.confirmed',
	'definition.first',
	'definition.fifth',
	'export.first'
] as const;

export type Milestone = (typeof MILESTONES)[number];

/**
 * Record that a community reached a step, at most once.
 *
 * Called inside the transaction that makes the thing true, so a milestone cannot
 * be recorded for something that then rolled back. `on conflict do nothing` is
 * what makes it safe to call on every adoption rather than only the first.
 */
export function reached(db: Db, communityId: string, milestone: Milestone, now: number): void {
	// One flag, per `docs/00` §12's own escape hatch: a self-hosted instance that
	// wants even this off gets it off, and everything else behaves identically.
	if (!getConfig().productAnalytics) return;

	db.insert(funnelEvent)
		.values({ id: newId(), communityId, kind: milestone, at: new Date(now) })
		.onConflictDoNothing()
		.run();
}

/** How many communities reached each step. The whole of what the console shows. */
export function funnel(db: Db): { milestone: Milestone; communities: number }[] {
	const rows = db
		.select({ kind: funnelEvent.kind })
		.from(funnelEvent)
		.where(inArray(funnelEvent.kind, [...MILESTONES]))
		.all();

	return MILESTONES.map((milestone) => ({
		milestone,
		communities: rows.filter((row) => row.kind === milestone).length
	}));
}

/** For the suite: whether one community reached one step. */
export const hasReached = (db: Db, communityId: string, milestone: Milestone): boolean =>
	db
		.select()
		.from(funnelEvent)
		.where(eq(funnelEvent.communityId, communityId))
		.all()
		.some((row) => row.kind === milestone);

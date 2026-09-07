import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Audience } from './audience.js';
import { ctxCan } from './guard.js';

/**
 * What this reader may see, as a condition inside the query.
 * `docs/03-data-model.md` §9, `docs/04-security.md` §4.
 *
 * One helper, used by every read path, and applied **in** the query rather than
 * to its results. The reasoning is the tenant boundary's, from P5: a read that
 * fetches everything and narrows afterwards is one careless refactor away from
 * not narrowing, and the failure is silent and in the worst possible direction.
 *
 * ## The three answers
 *
 * - **Anonymous** sees `world` and nothing else. There is no session, no
 *   membership and nothing to widen it with.
 * - **A member** sees `member` and `world`, plus `restricted` subjects whose
 *   exception names an audience they belong to.
 * - Nobody sees a `restricted` subject with no live exception, which the
 *   service layer makes unreachable anyway by writing the two together.
 */
export function visibleTo(audience: Audience, column: AnySQLiteColumn): SQL {
	if (audience.kind === 'anonymous') return eq(column, 'world');

	const levels: string[] = ['member', 'world'];
	/**
	 * `exception.read` rather than a role comparison — the boundary rule caught
	 * the first version of this line, and it was right to. The capability has
	 * been in the matrix since P2 with exactly this meaning and nothing had used
	 * it yet.
	 *
	 * `stewards` is the only audience an exception can name today, so the whole
	 * question collapses to one capability check. A second audience makes this a
	 * join against the live exceptions and does not change the signature, which
	 * is the point of having a helper at all.
	 */
	if (ctxCan(audience.ctx, 'exception.read')) levels.push('restricted');

	return inArray(column, levels);
}

/** Everything, for the aggregates that count what a community has. */
export const everything = (): SQL => sql`1 = 1`;

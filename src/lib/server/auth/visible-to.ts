import { eq, inArray, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Audience, Reader } from './audience.js';
import { toAudience } from './audience.js';
import { ctxCan, requirePermission } from './guard.js';
import type { Capability } from './permissions.js';
import type { Visibility } from '../db/schema/visibility.js';

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
	if (audience.kind === 'scoped') return inArray(column, [...audience.levels]);

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

/**
 * The permission a read needs, when there is somebody to ask it of.
 *
 * A member reading their own community is checked the way P1–P5 checks
 * everything. An anonymous reader is not refused and not granted: there is no
 * permission to hold, and `visibleTo` is the whole of what they may see. That
 * is the point of the split — the filter is the authorisation for the public
 * surface, so it can never be the thing somebody forgets to add after the
 * permission check passed.
 */
export function requireRead(reader: Reader, capability: Capability = 'community.read'): Audience {
	const audience = toAudience(reader);
	if (audience.kind === 'signed_in') requirePermission(audience.ctx, capability);
	return audience;
}

/**
 * The same answer as `visibleTo`, as a list rather than a condition.
 *
 * The search index is not a table we can put a drizzle condition on — it is
 * FTS5 behind an interface, and the interface may not take SQL. So the one
 * decision about what a reader may see is made here, once, and handed to the
 * index as data. Two functions, one rule: if they ever disagree the tests in
 * `visibility.test.ts` fail, because both are exercised through the same
 * registry entries.
 */
export function visibleLevels(audience: Audience): Visibility[] {
	if (audience.kind === 'anonymous') return ['world'];
	if (audience.kind === 'scoped') return [...audience.levels];
	const levels: Visibility[] = ['member', 'world'];
	if (ctxCan(audience.ctx, 'exception.read')) levels.push('restricted');
	return levels;
}

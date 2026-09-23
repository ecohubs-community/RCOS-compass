import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { asSignedIn } from '../auth/audience.js';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { visibleTo } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { definition, standardFeedback } from '../db/schema/definitions.js';
import { membership } from '../db/schema/tenancy.js';
import { getStandard } from '../standard/index.js';
import { isoDateIn } from '../../time/format.js';
import { personLabel } from './person.js';

/**
 * What a community wished the standard had asked for, read back.
 * UI spec §1.4b kind 3, `openspec/changes/standard-feedback-view`.
 *
 * The rows have been written since the core loop — one checkbox on a new local
 * definition — and until this nothing read them, which made "sharing upstream is
 * opt-in" a promise about a door with nothing behind it. This is the reading
 * half: the settings panel and the export both come through here, so the page a
 * member reads and the file a steward sends somebody cannot disagree.
 *
 * **Readable by every member.** Recording feedback is a member right
 * (`feedback.record`), and a list of members' own words hidden from them would
 * be the odd one out. There is nothing to change on it, so nothing here needs
 * more than `community.read`.
 */

export type StandardFeedbackEntry = {
	id: string;
	kind: 'gap' | 'ambiguity' | 'conflict' | 'suggestion';
	/** The community's own words. */
	body: string;
	/** The standard and version it was written against — never the one pinned today. */
	standard: { id: string; version: string };
	/** The clause it is about, as that version numbers it, where one was named. */
	clauseRef: string | null;
	/** The definition it came from, while that still exists. */
	definitionId: string | null;
	/** Through `personLabel`; null only when the account row is gone entirely. */
	author: string | null;
	createdAt: number;
};

/**
 * The community's feedback on the standard, newest first.
 *
 * An entry tied to a definition the reader may not see is left out **in the
 * query**, through the same `visibleTo` every read path uses: the body is, today,
 * the definition's title, so listing it would print a restricted definition's
 * name to somebody the restriction exists to keep it from. An entry whose
 * definition has since been deleted is kept — the words are the community's, and
 * outlive the draft they were ticked on.
 */
export function listStandardFeedback(ctx: Ctx, options: { db?: Db } = {}): StandardFeedbackEntry[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const communityId = ctx.community.id;

	return (
		db
			.select({
				id: standardFeedback.id,
				kind: standardFeedback.kind,
				body: standardFeedback.body,
				standardId: standardFeedback.standardId,
				version: standardFeedback.version,
				clauseKey: standardFeedback.clauseKey,
				definitionId: definition.id,
				createdBy: standardFeedback.createdBy,
				createdAt: standardFeedback.createdAt,
				name: user.name,
				erasedAt: user.erasedAt,
				displayName: membership.displayName,
				seq: membership.seq
			})
			.from(standardFeedback)
			// Joined inside this community as well as by id, so a row pointing across
			// the boundary finds nothing rather than somebody else's definition.
			.leftJoin(
				definition,
				and(
					eq(definition.id, standardFeedback.definitionId),
					eq(definition.communityId, communityId)
				)
			)
			.leftJoin(user, eq(user.id, standardFeedback.createdBy))
			// Their membership *here*: the former-member label is a number in this
			// community, and another community's number would join two records.
			.leftJoin(
				membership,
				and(
					eq(membership.userId, standardFeedback.createdBy),
					eq(membership.communityId, communityId)
				)
			)
			.where(
				and(
					eq(standardFeedback.communityId, communityId),
					or(
						isNull(standardFeedback.definitionId),
						visibleTo(asSignedIn(ctx), definition.visibility)
					)
				)
			)
			.orderBy(desc(standardFeedback.createdAt), desc(standardFeedback.id))
			.all()
			.map((row) => ({
				id: row.id,
				kind: row.kind,
				body: row.body,
				standard: { id: row.standardId, version: row.version },
				clauseRef: row.clauseKey ? clauseRefOf(row.standardId, row.version, row.clauseKey) : null,
				definitionId: row.definitionId,
				author:
					row.createdBy === null
						? null
						: personLabel({
								erasedAt: row.erasedAt ?? null,
								name: row.name,
								displayName: row.displayName,
								seq: row.seq
							}),
				createdAt: row.createdAt.getTime()
			}))
	);
}

/**
 * The ref as the entry's own version numbers it.
 *
 * Refs move between versions (AGENT.md, "Clause IDs are a triple"), so the key
 * is resolved against the version the community was working to when they wrote
 * it. A version this instance no longer carries yields no ref rather than a
 * failed page: the words are still worth reading without one.
 */
function clauseRefOf(standardId: string, version: string, clauseKey: string): string | null {
	try {
		return getStandard(standardId, version).clause(clauseKey)?.ref ?? null;
	} catch {
		return null;
	}
}

/**
 * The same entries as Markdown, for the export bundle.
 *
 * English and plain, like the register beside it: a bundle is written by a job
 * with no reader whose language we could know, and it has to read in five years
 * with nothing running.
 */
export function standardFeedbackAsMarkdown(
	entries: StandardFeedbackEntry[],
	communityName: string,
	/** The community's zone: an entry is filed under the day it was written there. */
	timeZone: string
): string {
	const lines = [
		`# ${communityName} — feedback on the standard`,
		'',
		'What this community recorded as something the standard should ask for. Nothing',
		'here has been sent anywhere; sharing it with the standard’s stewards is up to you.',
		''
	];
	if (entries.length === 0) lines.push('*No feedback on the standard has been recorded.*', '');
	for (const entry of entries) {
		lines.push(
			`## ${entry.body.replace(/\n+/g, ' ')}`,
			'',
			[
				`${entry.standard.id} v${entry.standard.version}${entry.clauseRef ? ` · ${entry.clauseRef}` : ''}`,
				entry.kind,
				entry.author ?? 'unknown',
				isoDateIn(entry.createdAt, timeZone)
			].join(' · '),
			''
		);
	}
	return lines.join('\n');
}

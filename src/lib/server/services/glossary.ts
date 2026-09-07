import { eq, inArray } from 'drizzle-orm';
import { communityOf, type Reader } from '../auth/audience.js';
import { requireRead } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { definitionVersion } from '../db/schema/definitions.js';
import type { Locale } from '../standard/types.js';
import { standardViewFor } from './completeness.js';
import { definitionsBySection } from './definitions.js';
import { community } from '../db/schema/tenancy.js';

/** The community's own language, without needing a member context to ask. */
function localeOfCommunity(db: Db, communityId: string): Locale {
	const row = db
		.select({ locale: community.locale })
		.from(community)
		.where(eq(community.id, communityId))
		.get();
	return (row?.locale ?? 'en') as Locale;
}

/**
 * The standard's vocabulary, beside the community's own. UI spec §4.8.
 *
 * A join, computed at read time and stored nowhere. Nothing here can be stale,
 * because there is no second copy to fall behind: freezing a definition changes
 * the glossary with nobody maintaining a glossary, and a superseded version
 * disappears from it the moment its replacement is adopted.
 *
 * The link between a term and the section a community answers it in comes from
 * the standard itself (`glossary.yaml`'s `definedBy`, added upstream in this
 * change and re-vendored). Matching a term to a section by name similarity was
 * the obvious alternative and is rejected: it would be wrong quietly, and being
 * quietly wrong about which of a community's rules defines "Member" is worse
 * than showing nothing.
 */

export type GlossaryEntry = {
	key: string;
	/** The standard's word for it, in the community's locale where there is one. */
	term: string;
	definition: string;
	/** True when the standard has no translation and English was used instead. */
	isFallback: boolean;
	/**
	 * How this community answers the term, when it has.
	 *
	 * `sectionKey` is null for the terms that describe the standard rather than
	 * the community — `layer`, `compliance`, `artifact`. That is the correct
	 * answer for them rather than a gap, and the screen says so differently from
	 * "you have not defined this yet".
	 */
	sectionKey: string | null;
	sectionTitle: string | null;
	ours: { definitionId: string; body: string; adoptedAt: number } | null;
};

export function glossary(reader: Reader, options: { db?: Db } = {}): GlossaryEntry[] {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();

	const standard = standardViewFor(db, communityOf(audience));
	if (!standard) return [];

	const locale = localeOfCommunity(db, communityOf(audience));
	// Filtered by the same helper as everything else: the community half of a
	// term is that community's adopted text, and a reader who may not see the
	// definition may not see it here either.
	const bySection = definitionsBySection(audience, { db });

	// One query for the adopted texts rather than one per term: 37 terms is 37
	// round trips otherwise, on a page that is nothing but this loop.
	const adoptedIds = [...bySection.values()]
		.map((row) => row.adoptedVersionId)
		.filter((id): id is string => id !== null);
	const bodies = new Map(
		adoptedIds.length === 0
			? []
			: db
					.select()
					.from(definitionVersion)
					.where(inArray(definitionVersion.id, adoptedIds))
					.all()
					.map((row) => [row.id, row])
	);

	return standard.view.glossary.map((term) => {
		const localised = standard.view.localise(term.i18n, locale);
		const section = term.definedBy ? standard.view.section(term.definedBy) : undefined;
		const mine = term.definedBy ? bySection.get(term.definedBy) : undefined;
		const version = mine?.adoptedVersionId ? bodies.get(mine.adoptedVersionId) : undefined;

		return {
			key: term.key,
			term: localised.value.term,
			definition: localised.value.definition,
			isFallback: localised.isFallback,
			sectionKey: term.definedBy ?? null,
			sectionTitle: section
				? standard.view.localise(section.i18n, locale).value.title
				: (term.definedBy ?? null),
			ours:
				version && mine
					? {
							definitionId: mine.id,
							body: version.body,
							adoptedAt: (version.adoptedAt ?? version.createdAt).getTime()
						}
					: null
		};
	});
}

/** One term, for the panel that opens over whatever somebody was reading. */
export function glossaryTerm(
	reader: Reader,
	key: string,
	options: { db?: Db } = {}
): GlossaryEntry | null {
	return glossary(reader, options).find((entry) => entry.key === key) ?? null;
}

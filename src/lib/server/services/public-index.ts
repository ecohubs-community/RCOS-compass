import { and, eq } from 'drizzle-orm';
import { communityOf, type Audience } from '../auth/audience.js';
import { visibleTo } from '../auth/visible-to.js';
import type { Db } from '../db/index.js';
import { definition, definitionVersion, communityArtifact } from '../db/schema/definitions.js';
import { standardViewFor } from './completeness.js';
import { communityLocale } from './community-locale.js';

/**
 * What a community has actually published, as a list. RCOS Appendix C.6.
 *
 * An RCOS artifact is published when at least one of its definitions is
 * world-visible: the artifact is a shape in the standard rather than a row, so
 * there is nothing to set a flag on. A community artifact is a row and carries
 * its own visibility.
 */

export type PublicArtifact = {
	key: string;
	title: string;
	layer: number | null;
	kind: 'standard' | 'community';
	/** The most recent adoption in it, which is the date the appendix asks for. */
	updatedAt: number | null;
};

export function publishedArtifacts(db: Db, audience: Audience): PublicArtifact[] {
	const communityId = communityOf(audience);
	const standard = standardViewFor(db, communityId);
	if (!standard) return [];

	/**
	 * One query for every published section, with the date it was adopted.
	 *
	 * The first version called `renderArtifact` once per artifact and threw away
	 * everything but the title and the newest date — five queries each, for a
	 * page that shows one line per artifact. An index over eleven artifacts was
	 * fifty-odd queries, on the one route in the product a crawler hits hardest.
	 */
	const publishedSections = db
		.select({
			sectionKey: definition.sectionKey,
			adoptedAt: definitionVersion.adoptedAt,
			createdAt: definitionVersion.createdAt
		})
		.from(definition)
		.leftJoin(definitionVersion, eq(definitionVersion.id, definition.adoptedVersionId))
		.where(
			and(
				eq(definition.communityId, communityId),
				eq(definition.scope, 'standard'),
				visibleTo(audience, definition.visibility)
			)
		)
		.all();

	const adoptedAtOf = new Map<string, number>();
	for (const row of publishedSections) {
		if (row.sectionKey === null) continue;
		const at = (row.adoptedAt ?? row.createdAt)?.getTime();
		if (at !== undefined) adoptedAtOf.set(row.sectionKey, at);
	}
	// Answered but not yet adopted still counts as published — the definition row
	// is world-visible, which is what a reader sees. The date is simply absent.
	const published = new Set(
		publishedSections.map((row) => row.sectionKey).filter((key): key is string => key !== null)
	);

	const locale = communityLocale(db, communityId);

	const fromStandard = standard.view.artifacts
		.map((artifact) => {
			const sections = standard.view
				.authoredSectionsOf(artifact.key)
				.filter((section) => published.has(section.key));
			if (sections.length === 0) return null;
			const dates = sections
				.map((section) => adoptedAtOf.get(section.key))
				.filter((at): at is number => at !== undefined);
			return {
				key: artifact.key,
				title: standard.view.localise(artifact.i18n, locale).value.title ?? artifact.key,
				layer: artifact.layer,
				kind: 'standard' as const,
				updatedAt: dates.length > 0 ? Math.max(...dates) : null
			};
		})
		.filter((artifact) => artifact !== null);

	const own = db
		.select()
		.from(communityArtifact)
		.where(
			and(
				eq(communityArtifact.communityId, communityId),
				visibleTo(audience, communityArtifact.visibility)
			)
		)
		.all()
		.map((row) => ({
			key: row.id,
			title: row.title,
			layer: row.layer,
			kind: 'community' as const,
			updatedAt: row.firstPublishedAt?.getTime() ?? null
		}));

	return [...fromStandard, ...own];
}

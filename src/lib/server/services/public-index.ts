import { and, eq } from 'drizzle-orm';
import { communityOf, type Audience } from '../auth/audience.js';
import { visibleTo } from '../auth/visible-to.js';
import type { Db } from '../db/index.js';
import { communityArtifact, definition } from '../db/schema/definitions.js';
import { standardViewFor } from './completeness.js';
import { renderArtifact } from './render-artifact.js';

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

	const publishedSections = new Set(
		db
			.select({ sectionKey: definition.sectionKey })
			.from(definition)
			.where(
				and(
					eq(definition.communityId, communityId),
					eq(definition.scope, 'standard'),
					visibleTo(audience, definition.visibility)
				)
			)
			.all()
			.map((row) => row.sectionKey)
			.filter((key): key is string => key !== null)
	);

	const fromStandard = standard.view.artifacts
		.filter((artifact) =>
			standard.view.authoredSectionsOf(artifact.key).some((s) => publishedSections.has(s.key))
		)
		.map((artifact) => {
			const rendered = renderArtifact(db, audience, artifact.key);
			const dates = (rendered?.sections ?? [])
				.map((section) => section.adopted?.adoptedAt)
				.filter((at): at is number => at !== undefined);
			return {
				key: artifact.key,
				title: rendered?.title ?? artifact.key,
				layer: artifact.layer,
				kind: 'standard' as const,
				updatedAt: dates.length > 0 ? Math.max(...dates) : null
			};
		});

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

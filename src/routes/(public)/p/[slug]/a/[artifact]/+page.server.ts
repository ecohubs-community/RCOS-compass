import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { anonymousIn } from '$lib/server/auth/audience';
import { getDb } from '$lib/server/db';
import { definition } from '$lib/server/db/schema/definitions';
import { standardViewFor } from '$lib/server/services/completeness';
import { renderArtifact } from '$lib/server/services/render-artifact';
import { parseMarkdown } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

/**
 * One published artifact, as a document. UI spec §4.8.
 *
 * Rendered through the same function as the export and the mirror, so the three
 * cannot say different things about the same artifact.
 *
 * **410 rather than 404 for something withdrawn.** The page existed, somebody
 * may be holding the link the community itself gave them, and saying it never
 * existed is a lie they can check against their own history. `first_published_at`
 * is what distinguishes the two, because current visibility cannot.
 */
export const load: PageServerLoad = async ({ params, parent, setHeaders }) => {
	const { community } = await parent();
	const db = getDb();
	const audience = anonymousIn(community.id);

	const standard = standardViewFor(db, community.id);
	if (!standard?.view.artifact(params.artifact)) error(404, 'Not found');

	const rendered = renderArtifact(db, audience, params.artifact);
	const published = (rendered?.sections ?? []).some((section) => section.body !== null);

	if (!published) {
		// Was it ever public? Only `first_published_at` knows.
		const sectionKeys = standard.view
			.authoredSectionsOf(params.artifact)
			.map((section) => section.key);
		const everPublished =
			sectionKeys.length > 0 &&
			db
				.select({ at: definition.firstPublishedAt })
				.from(definition)
				.where(
					and(eq(definition.communityId, community.id), inArray(definition.sectionKey, sectionKeys))
				)
				.all()
				.some((row) => row.at !== null);

		if (everPublished) {
			error(410, 'This community has withdrawn this document.');
		}
		error(404, 'Not found');
	}

	// Cacheable, because it is public and changes when a community decides
	// something — which is not often, and never urgently.
	setHeaders({ 'cache-control': 'public, max-age=300' });

	// Parsed on the server, like every other body in the product: the renderer
	// deals in the community's text, and turning it into blocks is the HTML
	// adapter's job rather than something the Markdown and mirror adapters have
	// to carry.
	return {
		artifact: {
			...rendered!,
			sections: rendered!.sections.map((section) => ({
				...section,
				blocks: section.body ? parseMarkdown(section.body) : null
			})),
			localAdditions: rendered!.localAdditions.map((addition) => ({
				...addition,
				blocks: parseMarkdown(addition.body)
			}))
		}
	};
};

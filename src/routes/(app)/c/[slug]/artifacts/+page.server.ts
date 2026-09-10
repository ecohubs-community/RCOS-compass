import { anonymousIn } from '$lib/server/auth/audience';
import { getDb } from '$lib/server/db';
import {
	activeStandardView,
	answeredSections,
	progressOf
} from '$lib/server/services/completeness';
import { publishedArtifacts } from '$lib/server/services/public-index';
import type { PageServerLoad } from './$types';

/**
 * The twenty-one things the standard asks a community to have.
 *
 * Design: `design_files/platform/RCOS Compass.dc.html`, artboard 12. Everything
 * it shows already existed — `progressOf` counts the sections, `publishedArtifacts`
 * knows what is outward-facing — and there was no screen: a member could see
 * "3 of 21 artifacts complete" in the sidebar and had nowhere to go to find out
 * which three, or what the other eighteen are.
 *
 * The order is the standard's own, by layer then position, rather than by how
 * far along each one is. Sorting by progress would put the finished work at the
 * top and bury what is missing, which is the opposite of what this page is for.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const standard = activeStandardView(db, ctx);

	if (!standard) {
		return { artifacts: [], counts: null };
	}

	const answered = answeredSections(db, standard.row.id);
	/**
	 * What a stranger can see, asked as a stranger.
	 *
	 * `anonymousIn` rather than this member's own audience: "on your public page"
	 * has to mean what the public can read, and a steward's view of it would
	 * count things nobody outside can open.
	 */
	const published = new Set(
		publishedArtifacts(db, anonymousIn(ctx.community.id)).map((a) => a.key)
	);
	const locale = ctx.community.locale as 'en';

	const artifacts = standard.view.artifacts
		.map((artifact) => {
			const progress = progressOf(standard, artifact.key, answered);
			return {
				key: artifact.key,
				title: standard.view.localise(artifact.i18n, locale).value.title ?? artifact.key,
				summary: standard.view.localise(artifact.i18n, locale).value.summary,
				layer: artifact.layer,
				mandatory: artifact.mandatory,
				authored: progress.authored,
				answered: progress.answered,
				complete: progress.complete,
				published: published.has(artifact.key),
				/**
				 * The first section still without an adopted definition — where
				 * "Start it" should land, so the button opens the work rather than
				 * the top of a page somebody then has to read through.
				 */
				firstMissing: progress.missing[0] ?? null
			};
		})
		.sort((a, b) => (a.layer ?? 99) - (b.layer ?? 99) || a.title.localeCompare(b.title));

	return {
		artifacts,
		counts: {
			total: artifacts.length,
			complete: artifacts.filter((a) => a.complete).length,
			// Required and not begun: the ones that make the outward claim false.
			notStarted: artifacts.filter((a) => a.mandatory && a.answered === 0).length,
			published: artifacts.filter((a) => a.published).length,
			mandatoryIncomplete: artifacts.filter((a) => a.mandatory && !a.complete).length
		}
	};
};

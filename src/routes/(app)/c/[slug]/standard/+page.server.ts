import { getDb } from '$lib/server/db';
import { activeStandardView, answeredSections } from '$lib/server/services/completeness';
import { definitionsBySection } from '$lib/server/services/definitions';
import type { PageServerLoad } from './$types';

/**
 * The standard browser. UI spec §4.2 — the spec, readable, with the community's
 * own status woven in. "This is the page you show a sceptical member."
 *
 * Grouped by artifact rather than listing 213 clauses: a member reading this is
 * asking "what does it want from us and where are we", not "what is clause
 * 3.6.4".
 */
export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const standard = activeStandardView(db, ctx);
	if (!standard) return { artifacts: [], counts: null, filters: { gapsOnly: false } };

	const answered = answeredSections(db, standard.row.id);
	const byId = definitionsBySection(ctx, { db });
	const gapsOnly = url.searchParams.get('gaps') === '1';

	const artifacts = standard.view.artifacts
		.map((artifact) => {
			const authored = standard.view.authoredSectionsOf(artifact.key);
			const sections = authored
				.map((section) => {
					const owned = standard.view
						.countableClauses()
						.filter((clause) => clause.owner === section.key);
					const definition = byId.get(section.key);

					return {
						key: section.key,
						title: standard.view.localise(section.i18n, ctx.community.locale as 'en').value.title,
						refs: owned.map((clause) => clause.ref),
						definitionId: definition?.id ?? null,
						status: definition?.adoptedVersionId
							? ('adopted' as const)
							: definition
								? ('drafting' as const)
								: ('not_started' as const),
						provisional: definition?.provisional ?? false
					};
				})
				.filter((section) => !gapsOnly || section.status !== 'adopted');

			return {
				key: artifact.key,
				title: standard.view.localise(artifact.i18n, ctx.community.locale as 'en').value.title,
				layer: artifact.layer,
				mandatory: artifact.mandatory,
				sections,
				// The platform fills these; they are shown as done, never as work.
				filledByPlatform: standard.view.sectionsFilledFromDecision(artifact.key).length,
				answered: authored.filter((section) => answered.has(section.key)).length,
				authored: authored.length
			};
		})
		.filter((artifact) => artifact.sections.length > 0);

	return {
		artifacts,
		counts: {
			clauses: standard.view.counts().clauses,
			mandatoryArtifacts: standard.view.counts().mandatoryArtifacts,
			satisfied: answered.size
		},
		filters: { gapsOnly }
	};
};

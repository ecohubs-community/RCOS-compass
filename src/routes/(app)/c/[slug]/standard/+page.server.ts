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

	// Built once. `countableClauses()` re-filters all 213 clauses on every call,
	// and this page has 94 sections to render.
	/**
	 * The glossary term a section defines, where the standard says so.
	 *
	 * An exact mapping from `glossary.yaml`'s `definedBy` rather than matching a
	 * title against a term — a guess would be wrong quietly, and quietly wrong
	 * about which rule defines "Member" is worse than showing nothing.
	 */
	const termBySection = new Map(
		standard.view.glossary
			.filter((term) => term.definedBy)
			.map((term) => [
				term.definedBy!,
				{
					key: term.key,
					label: standard.view.localise(term.i18n, ctx.community.locale as 'en').value.term
				}
			])
	);

	const refsBySection = new Map<string, string[]>();
	for (const clause of standard.view.countableClauses()) {
		if (!clause.owner) continue;
		refsBySection.set(clause.owner, [...(refsBySection.get(clause.owner) ?? []), clause.ref]);
	}

	const artifacts = standard.view.artifacts
		.map((artifact) => {
			const authored = standard.view.authoredSectionsOf(artifact.key);
			const sections = authored
				.map((section) => {
					const definition = byId.get(section.key);

					return {
						key: section.key,
						title: standard.view.localise(section.i18n, ctx.community.locale as 'en').value.title,
						refs: refsBySection.get(section.key) ?? [],
						definitionId: definition?.id ?? null,
						term: termBySection.get(section.key) ?? null,
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

import { getDb } from '$lib/server/db';
import { ctxCan } from '$lib/server/auth/guard';
import { adoptedVersion, getDefinition } from '$lib/server/services/definitions';
import { activeStandardView } from '$lib/server/services/completeness';
import { lint } from '$lib/server/linter';
import { parseMarkdown } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

/**
 * The definition detail — the hero screen. UI spec §4.3.
 *
 * Three fixed columns, always the same triad: *what the standard asks / what we
 * said / how we got here*. A local definition has no standard asking anything,
 * so its left column is absent rather than empty (§3a.1) — an empty column reads
 * as a missing feature instead of a deliberate absence.
 */
export const load: PageServerLoad = ({ locals, params }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	const found = getDefinition(ctx, params.id, { db });
	const version = adoptedVersion(ctx, params.id, { db });
	const standard = activeStandardView(db, ctx);

	const section =
		found.sectionKey && standard ? standard.view.section(found.sectionKey) : undefined;
	const localised =
		section && standard
			? standard.view.localise(section.i18n, ctx.community.locale as 'en').value
			: null;

	const clauses =
		section && standard
			? standard.view.countableClauses().filter((clause) => clause.owner === section.key)
			: [];

	return {
		definition: {
			id: found.id,
			scope: found.scope,
			title: localised?.title ?? found.title ?? 'Untitled',
			provisional: found.provisional,
			adopted: found.adoptedVersionId !== null,
			reviewDueAt: found.reviewDueAt?.getTime() ?? null,
			attachedTo: found.attachRcosArtifactKey
		},
		/** The left column: null for a local definition, by design. */
		requirement: section &&
			standard && {
				artifact: section.artifact,
				refs: clauses.map((clause) => clause.ref),
				text: clauses.map((clause) => ({
					ref: clause.ref,
					body: standard.view.clauseText(clause, ctx.community.locale as 'en').value
				})),
				whyItMatters: localised?.whyItMatters ?? null,
				whatToDefine: localised?.whatToDefine ?? null
			},
		version: version && {
			n: version.n,
			body: parseMarkdown(version.body),
			plainLanguage: version.plainLanguage,
			type: version.type,
			adoptedAt: version.adoptedAt?.getTime() ?? null,
			linter: lint({
				body: version.body,
				plainLanguage: version.plainLanguage,
				type: version.type,
				locale: ctx.community.locale
			}).findings
		},
		can: { propose: ctxCan(ctx, 'proposal.create') }
	};
};

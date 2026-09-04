import { getDb } from '$lib/server/db';
import { ctxCan } from '$lib/server/auth/guard';
import { adoptedVersion, getDefinition, getDraft } from '$lib/server/services/definitions';
import { definitionOrigin } from '$lib/server/services/evidence';
import { activeStandardView } from '$lib/server/services/completeness';
import { lint } from '$lib/server/linter';
import { parseMarkdown } from '$lib/server/markdown';
import { fail } from '@sveltejs/kit';
import { aiAvailability } from '$lib/server/ai/run';
import { lintWithAssist } from '$lib/server/services/linting';
import type { Actions, PageServerLoad } from './$types';

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
	/**
	 * The draft, when nothing is adopted yet.
	 *
	 * Without this the middle column says "nothing has been adopted" over text a
	 * member has already written — and a definition pre-filled from their own
	 * document would be invisible on the one screen that exists to show it.
	 */
	const draft = version ? null : getDraft(ctx, params.id, { db });

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
		draft: draft &&
			draft.body.trim() !== '' && {
				body: parseMarkdown(draft.body),
				updatedAt: draft.updatedAt
			},
		/** The passage this began as, when it began as one. */
		origin: definitionOrigin(ctx, params.id, { db }),
		/**
		 * Whether the two assisted checks can be offered.
		 *
		 * They are **not** run here. Each one costs a member a task from their
		 * daily allowance, and spending that because somebody opened a page would
		 * empty an allowance nobody chose to use.
		 */
		assist: aiAvailability(ctx, { db }) === null,
		can: { propose: ctxCan(ctx, 'proposal.create') }
	};
};

export const actions: Actions = {
	/**
	 * The two questions a word list cannot answer, asked on request.
	 *
	 * docs/11 §8: they degrade to silence, never to a guess — so what comes back
	 * when they cannot run is a finding saying they did not run, which the panel
	 * shows like any other.
	 */
	assist: async (event) => {
		const ctx = event.locals.ctx!;
		const db = getDb();

		const found = getDefinition(ctx, event.params.id, { db });
		const version = adoptedVersion(ctx, event.params.id, { db });
		const draft = version ? null : getDraft(ctx, event.params.id, { db });
		const body = version?.body ?? draft?.body ?? '';

		if (!body.trim()) return fail(409, { error: 'There is nothing written here yet.' });

		const result = await lintWithAssist(
			ctx,
			{
				body,
				plainLanguage: version?.plainLanguage ?? draft?.plainLanguage ?? null,
				type: version?.type ?? draft?.type ?? null,
				locale: ctx.community.locale,
				layer: found.layer
			},
			{ db }
		);

		return { linter: result.findings, assisted: result.assisted };
	}
};

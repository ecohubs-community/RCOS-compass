import { getDb, type Db } from '$lib/server/db';
import { ctxCan, type Ctx } from '$lib/server/auth/guard';
import {
	adoptedVersion,
	getDefinition,
	getDraft,
	runLinter,
	saveDraft,
	StaleDraftError
} from '$lib/server/services/definitions';
import { definitionOrigin } from '$lib/server/services/evidence';
import { activeStandardView } from '$lib/server/services/completeness';
import { isCurrentShape, type LintResult } from '$lib/shared/linter';
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
	 * The draft — always, not only when nothing is adopted.
	 *
	 * A definition that has been adopted is the one most likely to be revised, and
	 * `freeze` reads the draft's plain-language mirror when it records the next
	 * version. Nulling it here left the editor in a branch of the page no
	 * definition the application creates could ever be in.
	 */
	const draft = draftIfAny(ctx, params.id, db);

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
			raw: version.body,
			/**
			 * The run that judged this text, as it was stored — never one computed
			 * now. A verdict that can change without anybody editing anything is not
			 * a record of what the community was told when they adopted it.
			 */
			linter: readStored(version.linterResult)
		},
		/**
		 * The draft, whether or not anything has been written in it.
		 *
		 * Sent even when empty, because an empty draft is exactly the state the
		 * editor exists to fill — the screen used to hide it, so a definition with
		 * nothing in it offered no way to put anything there.
		 */
		draft: draft && {
			body: parseMarkdown(draft.body),
			raw: draft.body,
			plainLanguage: draft.plainLanguage,
			written: draft.body.trim() !== '',
			linter: readStored(draft.linterResult),
			editToken: draft.editToken,
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
		can: { propose: ctxCan(ctx, 'proposal.create'), draft: ctxCan(ctx, 'definition.draft') }
	};
};

/**
 * What a screen may draw beside the text.
 *
 * A result written before per-line linting existed describes a body, not lines.
 * It is still readable as findings; it is not something to annotate sentences
 * with — and rendering it as an empty annotation would read as "this definition
 * is clean", which is the worst thing a linter can say by accident.
 */
function readStored(stored: unknown): LintResult | null {
	return isCurrentShape(stored) ? stored : null;
}

/**
 * The draft, or nothing, rather than a 404 for the whole page.
 *
 * Every path that creates a definition creates its draft in the same
 * transaction, so a definition without one should not exist — but this load
 * runs for every definition, and a page that refuses to show an adopted version
 * because a *draft* row is missing would hide the community's own answer over a
 * detail no reader cares about. Missing means "nothing to edit here", not "gone".
 */
function draftIfAny(ctx: Ctx, definitionId: string, db: Db) {
	try {
		return getDraft(ctx, definitionId, { db });
	} catch (problem) {
		if ((problem as { status?: number }).status === 404) return null;
		throw problem;
	}
}

export const actions: Actions = {
	/**
	 * Write the draft.
	 *
	 * A stale token is refused rather than overwritten: silent last-write-wins on
	 * governance text is a bug a community notices only after quoting the wrong
	 * version. What comes back is what is actually there, so the editor can
	 * decide between keeping theirs, taking the other, or merging by hand
	 * (`docs/01` §1).
	 */
	save: async (event) => {
		const ctx = event.locals.ctx!;
		const form = await event.request.formData();
		try {
			saveDraft(
				ctx,
				{
					definitionId: event.params.id,
					editToken: String(form.get('editToken') ?? ''),
					body: String(form.get('body') ?? ''),
					plainLanguage: String(form.get('plainLanguage') ?? '') || null
				},
				{ db: getDb() }
			);
		} catch (problem) {
			if (problem instanceof StaleDraftError) {
				return fail(409, {
					step: 'save',
					error: 'This draft changed while you were editing it. What is saved now is below.',
					theirs: problem.current.body,
					theirPlainLanguage: problem.current.plainLanguage
				});
			}
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400 || http.status === 409) {
				return fail(http.status, {
					step: 'save',
					error: http.body?.message ?? 'That did not work.'
				});
			}
			throw problem;
		}
		return { step: 'save', saved: true };
	},

	/** Run the rule set on this definition's draft, and keep the result. */
	run: async (event) => {
		const ctx = event.locals.ctx!;
		try {
			runLinter(ctx, event.params.id, { db: getDb() });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 409 || http.status === 400) {
				return fail(http.status, { error: http.body?.message ?? 'That did not work.' });
			}
			throw problem;
		}
		return { ran: true };
	},

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
				locale: ctx.community.locale,
				layer: found.layer
			},
			{ db }
		);

		return { linter: result, assisted: result.assisted };
	}
};

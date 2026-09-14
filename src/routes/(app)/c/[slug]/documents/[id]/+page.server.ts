import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { parseMarkdown } from '$lib/server/markdown';
import { getDocument, listPassages } from '$lib/server/services/documents';
import {
	confirmEvidence,
	dismissEvidence,
	evidenceForDocument,
	mapPassage,
	turnIntoDefinition
} from '$lib/server/services/evidence';
import { aiAvailability } from '$lib/server/ai/run';
import { runMapping } from '$lib/server/services/mapping';
import { links } from '$lib/links';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { run } from '$lib/server/http/form-action';

/**
 * One document: its passages, and what the community has said about them.
 * UI spec §4.5 — "you're further along than you think".
 *
 * The passages are the community's own text, so they go through the same
 * markdown pipeline as everything a member writes: parsed to a node tree,
 * rendered by templating, no HTML sink anywhere. Document text is the most
 * hostile text in the product — it did not even come from a member typing into
 * a form — and it gets the same treatment, not a stricter copy of it.
 */
export const load: PageServerLoad = ({ locals, params }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	const found = getDocument(ctx, params.id, { db });
	const evidence = evidenceForDocument(ctx, params.id, { db });

	return {
		document: {
			id: found.id,
			filename: found.filename,
			status: found.status,
			statusDetail: found.statusDetail,
			pagesExtracted: found.pagesExtracted,
			pagesTotal: found.pagesTotal,
			uploadedAt: found.uploadedAt.getTime()
		},
		passages: listPassages(ctx, params.id, { db }).map((row) => ({
			id: row.id,
			page: row.page,
			kind: row.kind,
			blocks: parseMarkdown(row.text),
			evidence: evidence
				.filter((item) => item.passageId === row.id)
				.map((item) => ({
					id: item.id,
					clauseRef: item.clauseRef,
					state: item.state,
					suggestedBy: item.suggestedBy
				}))
		})),
		can: { map: ctxCan(ctx, 'mapping.confirm'), draft: ctxCan(ctx, 'definition.draft') },
		/**
		 * Whether to offer the AI run, and — when not — why in a sentence.
		 *
		 * Unavailable is a state the screen is designed for rather than an error it
		 * reports: no provider, a community that has not switched it on, and a
		 * member who has spent today's budget all read the same way, and all of
		 * them leave the manual path exactly where it was.
		 */
		ai:
			found.status === 'extracted' && ctxCan(ctx, 'ai.run')
				? (() => {
						const refusal = aiAvailability(ctx, { db });
						return refusal?.ok === false
							? { offer: false, reason: refusal.reason }
							: { offer: true, reason: null };
					})()
				: { offer: false, reason: null }
	};
};

export const actions: Actions = {
	map: async (event) => {
		const form = await event.request.formData();
		return run('map', () =>
			mapPassage(
				event.locals.ctx!,
				{
					passageId: String(form.get('passageId') ?? ''),
					clause: String(form.get('clause') ?? '')
				},
				{ db: getDb() }
			)
		);
	},

	suggest: async (event) => {
		const outcome = await run('suggest', async () =>
			runMapping(event.locals.ctx!, event.params.id, { db: getDb() })
		);
		if ('status' in outcome) return outcome;
		return { step: 'suggest', mapping: await outcome.result };
	},

	confirm: async (event) => {
		const form = await event.request.formData();
		return run('confirm', () =>
			confirmEvidence(event.locals.ctx!, String(form.get('evidenceId') ?? ''), { db: getDb() })
		);
	},

	dismiss: async (event) => {
		const form = await event.request.formData();
		return run('dismiss', () =>
			dismissEvidence(event.locals.ctx!, String(form.get('evidenceId') ?? ''), { db: getDb() })
		);
	},

	draft: async (event) => {
		const form = await event.request.formData();
		const outcome = await run('draft', () =>
			turnIntoDefinition(event.locals.ctx!, String(form.get('evidenceId') ?? ''), {
				db: getDb()
			})
		);
		if ('status' in outcome) return outcome;

		const made = outcome.result;
		redirect(
			303,
			made.kind === 'draft'
				? links.definition(event.params.slug, made.definitionId)
				: links.discussion(event.params.slug, made.discussionId)
		);
	}
};

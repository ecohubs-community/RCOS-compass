import { redirect } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { createLocalDefinition, newDefinitionChoices } from '$lib/server/services/definitions';
import { definitionsIndex } from '$lib/server/services/definitions-index';
import { run } from '$lib/server/http/form-action';
import { links } from '$lib/links';
import type { DefinitionStatus } from '$lib/shared/definition-status';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every definition the community has, both kinds, in one list.
 * `openspec/changes/provenance-ui` D12, the `definitions` spec.
 *
 * Filters are the URL's query, read here and sent by a plain GET form, so they
 * work with no JavaScript and a filtered list is a link somebody can share.
 */
const STATUSES: DefinitionStatus[] = [
	'drafting',
	'in_discussion',
	'in_vote',
	'adopted',
	'needs_review'
];

export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const asked = url.searchParams.get('status');
	const filters = {
		status: STATUSES.find((status) => status === asked) ?? null,
		artifact: url.searchParams.get('artifact') || null,
		attention: url.searchParams.get('attention') === '1',
		provisional: url.searchParams.get('provisional') === '1'
	};
	const index = definitionsIndex(ctx, filters, { db });
	const can = { draft: ctxCan(ctx, 'definition.draft') };

	return {
		...index,
		filters,
		statuses: STATUSES,
		choices: can.draft ? newDefinitionChoices(ctx, { db }) : null,
		/** The form opens itself again after a refusal, from `?new=1` or a failed submit. */
		newOpen: url.searchParams.get('new') === '1',
		can
	};
};

export const actions: Actions = {
	/** A local definition. Nothing is adopted until a steward freezes a version. */
	create: async ({ locals, request, params }) => {
		const form = await request.formData();
		const rawLayer = String(form.get('layer') ?? '').trim();
		const layer = rawLayer === '' ? null : Number(rawLayer);
		const touches = String(form.get('touches') ?? '')
			.split(/[\s,;]+/)
			.map((ref) => ref.trim())
			.filter(Boolean);

		const outcome = await run('create', () =>
			createLocalDefinition(
				locals.ctx!,
				{
					title: String(form.get('title') ?? ''),
					purpose: String(form.get('purpose') ?? '') || null,
					layer: layer === null || Number.isNaN(layer) ? null : layer,
					artifact: String(form.get('artifact') ?? '') || null,
					touches,
					standardShouldRequireThis: form.get('standardShouldRequireThis') === 'on'
				},
				{ db: getDb() }
			)
		);
		if ('status' in outcome) return outcome;
		const { id } = outcome.result as { id: string };
		redirect(303, links.definition(params.slug, id));
	}
};

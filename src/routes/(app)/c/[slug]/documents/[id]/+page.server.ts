import { redirect } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import {
	deleteVersionAction,
	replaceAction,
	restoreAction
} from '$lib/server/documents/version-actions';
import { ACCEPTED } from '$lib/server/documents/sniff';
import { run } from '$lib/server/http/form-action';
import { markMappingDone, reopenMapping } from '$lib/server/services/documents';
import {
	changeClause,
	confirmEvidence,
	dismissEvidence,
	dismissPassage,
	mapPassage,
	reconfirmStale,
	turnIntoDefinition
} from '$lib/server/services/evidence';
import { versionsWithPeople } from '$lib/server/services/library';
import { startScan } from '$lib/server/services/mapping';
import { workspaceView } from '$lib/server/services/workspace';
import { links } from '$lib/links';
import type { Actions, PageServerLoad } from './$types';

/**
 * One document: the text beside what the community has said about it. Designs 05
 * (two panes, 1024px and wider) and 16b (the queue below); the change's
 * `mapping-workspace` and `document-viewer` specs.
 *
 * Everything the screen shows comes from `workspaceView`, which both layouts
 * read. Every act is a form action through the shared `run` wrapper, and every
 * form posts back to the query it came from — `?passage=`, `?page=`, `?step=` —
 * so answering a card never loses the member's place, with or without
 * JavaScript.
 */
export const load: PageServerLoad = ({ locals, params, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	const pageParam = Number.parseInt(url.searchParams.get('page') ?? '', 10);
	const view = workspaceView(
		ctx,
		params.id,
		{
			page: Number.isFinite(pageParam) ? pageParam : null,
			passage: url.searchParams.get('passage')
		},
		{ db }
	);

	return {
		...view,
		step: url.searchParams.get('step') === 'confirm' ? ('confirm' as const) : ('read' as const),
		seePage: url.searchParams.get('view') === 'page',
		versions: view.counts.versions > 0 ? versionsWithPeople(ctx, params.id, { db }) : [],
		can: {
			map: ctxCan(ctx, 'mapping.confirm'),
			draft: ctxCan(ctx, 'definition.draft'),
			upload: ctxCan(ctx, 'document.upload'),
			destroy: ctxCan(ctx, 'document.destroy')
		},
		accepts: ACCEPTED.map((type) => `.${type}`).join(','),
		subCrumb: view.document.filename,
		fullHeight: true
	};
};

const field = async (event: { request: Request }) => {
	const form = await event.request.formData();
	return (name: string) => String(form.get(name) ?? '');
};

export const actions: Actions = {
	startScan: async (event) =>
		run('startScan', () => startScan(event.locals.ctx!, event.params.id, { db: getDb() })),

	confirm: async (event) => {
		const get = await field(event);
		return run('confirm', () =>
			confirmEvidence(event.locals.ctx!, get('evidenceId'), { db: getDb() })
		);
	},

	dismiss: async (event) => {
		const get = await field(event);
		return run('dismiss', () =>
			dismissEvidence(event.locals.ctx!, get('evidenceId'), { db: getDb() })
		);
	},

	changeClause: async (event) => {
		const get = await field(event);
		return run('changeClause', () =>
			changeClause(event.locals.ctx!, get('evidenceId'), get('clause'), { db: getDb() })
		);
	},

	dismissPassage: async (event) => {
		const get = await field(event);
		return run('dismissPassage', () =>
			dismissPassage(event.locals.ctx!, get('passageId'), { db: getDb() })
		);
	},

	map: async (event) => {
		const get = await field(event);
		const start = Number.parseInt(get('excerptStart'), 10);
		const end = Number.parseInt(get('excerptEnd'), 10);
		return run('map', () =>
			mapPassage(
				event.locals.ctx!,
				{
					passageId: get('passageId'),
					clause: get('clause'),
					excerpt: Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null
				},
				{ db: getDb() }
			)
		);
	},

	reconfirm: async (event) => {
		const get = await field(event);
		return run('reconfirm', () =>
			reconfirmStale(event.locals.ctx!, get('evidenceId'), { db: getDb() })
		);
	},

	markDone: async (event) =>
		run('markDone', () => markMappingDone(event.locals.ctx!, event.params.id, { db: getDb() })),

	reopen: async (event) =>
		run('reopen', () => reopenMapping(event.locals.ctx!, event.params.id, { db: getDb() })),

	draft: async (event) => {
		const get = await field(event);
		const outcome = await run('draft', () =>
			turnIntoDefinition(event.locals.ctx!, get('evidenceId'), { db: getDb() })
		);
		if ('status' in outcome) return outcome;

		const made = outcome.result;
		redirect(
			303,
			made.kind === 'draft'
				? links.definition(event.params.slug, made.definitionId)
				: links.discussion(event.params.slug, made.discussionId)
		);
	},

	replace: replaceAction,
	restore: restoreAction,
	deleteVersion: deleteVersionAction
};

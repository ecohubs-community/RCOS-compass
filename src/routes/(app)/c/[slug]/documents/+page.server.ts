import { fail, redirect } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { getConfig } from '$lib/server/config';
import { run } from '$lib/server/http/form-action';
import { UploadRefused, receiveUpload } from '$lib/server/documents/storage';
import { ACCEPTED } from '$lib/server/documents/sniff';
import { aiAvailability } from '$lib/server/ai/run';
import { activeStandardView } from '$lib/server/services/completeness';
import {
	deleteVersionAction,
	replaceAction,
	restoreAction
} from '$lib/server/documents/version-actions';
import { createDocument, deleteDocument } from '$lib/server/services/documents';
import {
	LIBRARY_FILTERS,
	libraryView,
	versionsWithPeople,
	type LibraryFilter
} from '$lib/server/services/library';
import { startScan } from '$lib/server/services/mapping';
import { links } from '$lib/links';
import type { Actions, PageServerLoad } from './$types';

/**
 * What a community already wrote down. Design 09, UI spec §4.5; the change's
 * `document-library` spec.
 *
 * The screen a forming community sees at 0% is a blank page; this is the one an
 * existing community sees, and it is the difference between bouncing and
 * staying — so every row says where its document stands and what to do next.
 */

/** Files per submission. With JavaScript the drop zone sends one per request. */
const MAX_FILES_PER_UPLOAD = 10;

export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	const config = getConfig();

	const asked = url.searchParams.get('filter');
	const filter: LibraryFilter = LIBRARY_FILTERS.includes(asked as LibraryFilter)
		? (asked as LibraryFilter)
		: 'all';
	const view = libraryView(ctx, filter, { db });

	/**
	 * Whether this member can start a scan at all, asked once for the page: the
	 * reasons that stop every document — no permission, AI off, a spent budget,
	 * no adopted standard — are about the member and the community, not the row.
	 * A row adds only its own reasons (still reading, a scan).
	 */
	const scanning = !ctxCan(ctx, 'ai.run')
		? { offer: false, reason: null }
		: !activeStandardView(db, ctx)
			? { offer: false, reason: 'Adopt a standard first; there is nothing to map it against yet.' }
			: (() => {
					const refusal = aiAvailability(ctx, { db });
					return refusal && !refusal.ok
						? { offer: false, reason: refusal.reason }
						: { offer: true, reason: null };
				})();

	return {
		filter,
		rows: view.rows.map((row) => ({
			...row,
			versions: row.counts.versions > 0 ? versionsWithPeople(ctx, row.id, { db }) : ([] as const)
		})),
		counts: view.counts,
		coverage: view.coverage,
		scanning,
		can: {
			upload: ctxCan(ctx, 'document.upload'),
			destroy: ctxCan(ctx, 'document.destroy'),
			scan: ctxCan(ctx, 'ai.run')
		},
		accepts: ACCEPTED.map((type) => `.${type}`).join(','),
		maxMb: config.MAX_UPLOAD_MB,
		maxFiles: MAX_FILES_PER_UPLOAD
	};
};

type UploadResult = { filename: string; ok: boolean; error?: string };

export const actions: Actions = {
	/**
	 * One or several files, each on its own: a refusal of the third file never
	 * undoes the first two, and the answer names every file with its outcome.
	 */
	upload: async (event) => {
		const form = await event.request.formData();
		const files = form
			.getAll('file')
			.filter((entry): entry is File => entry instanceof File && entry.size > 0);

		if (files.length === 0) return fail(400, { step: 'upload' as const, error: 'none' as const });
		if (files.length > MAX_FILES_PER_UPLOAD) {
			return fail(400, { step: 'upload' as const, error: 'too_many' as const });
		}

		const results: UploadResult[] = [];
		for (const file of files) {
			try {
				const stored = await receiveUpload(file, event.locals.ctx!.community.id);
				await createDocument(
					event.locals.ctx!,
					{ filename: file.name, file: stored },
					{ db: getDb() }
				);
				results.push({ filename: file.name, ok: true });
			} catch (problem) {
				const http = problem as { status?: number; body?: { message?: string } };
				if (problem instanceof UploadRefused) {
					results.push({ filename: file.name, ok: false, error: problem.reason });
				} else if (http.status === 409 || http.status === 400) {
					// A limit is something the member can act on — remove a document,
					// come back tomorrow — so it belongs beside the file, not on an
					// error page.
					results.push({
						filename: file.name,
						ok: false,
						error: http.body?.message ?? 'That did not work.'
					});
				} else {
					throw problem;
				}
			}
		}

		return { step: 'upload' as const, results };
	},

	scan: async (event) => {
		const form = await event.request.formData();
		const documentId = String(form.get('documentId') ?? '');
		const outcome = await run('scan', () =>
			startScan(event.locals.ctx!, documentId, { db: getDb() })
		);
		return 'result' in outcome ? { ...outcome, documentId } : outcome;
	},

	replace: replaceAction,
	restore: restoreAction,
	deleteVersion: deleteVersionAction,

	remove: async (event) => {
		const form = await event.request.formData();
		await deleteDocument(event.locals.ctx!, String(form.get('documentId') ?? ''), { db: getDb() });
		redirect(303, links.documents(event.params.slug));
	}
};

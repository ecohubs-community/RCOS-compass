import { fail, redirect } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { getConfig } from '$lib/server/config';
import { UploadRefused, receiveUpload } from '$lib/server/documents/storage';
import { ACCEPTED } from '$lib/server/documents/sniff';
import { createDocument, deleteDocument, listDocuments } from '$lib/server/services/documents';
import { links } from '$lib/links';
import type { Actions, PageServerLoad } from './$types';

/**
 * What a community already wrote down. UI spec §4.5.
 *
 * The screen a forming community sees at 0% is a blank page; this is the one an
 * existing community sees, and it is the difference between bouncing and
 * staying.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const config = getConfig();

	return {
		can: { upload: ctxCan(ctx, 'document.upload'), destroy: ctxCan(ctx, 'document.destroy') },
		accepts: ACCEPTED.map((type) => `.${type}`).join(','),
		maxMb: config.MAX_UPLOAD_MB,
		documents: listDocuments(ctx).map((row) => ({
			id: row.id,
			filename: row.filename,
			bytes: row.bytes,
			status: row.status,
			statusDetail: row.statusDetail,
			pagesExtracted: row.pagesExtracted,
			pagesTotal: row.pagesTotal,
			uploadedAt: row.uploadedAt.getTime()
		}))
	};
};

export const actions: Actions = {
	upload: async (event) => {
		const form = await event.request.formData();
		const file = form.get('file');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose a file to upload.' });
		}

		// Streamed and identified before anything is kept; the service then holds
		// the limits, the row and the move into place together.
		let stored;
		try {
			stored = await receiveUpload(file, event.locals.ctx!.community.id);
		} catch (problem) {
			if (problem instanceof UploadRefused) return fail(400, { error: problem.reason });
			throw problem;
		}

		try {
			await createDocument(
				event.locals.ctx!,
				{ filename: file.name, file: stored },
				{ db: getDb() }
			);
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			// A limit is something the member can act on — remove a document, come
			// back tomorrow — so it belongs beside the control, not on an error page.
			if (http.status === 409 || http.status === 400) {
				return fail(http.status, { error: http.body?.message ?? 'That did not work.' });
			}
			throw problem;
		}

		return { uploaded: true };
	},

	remove: async (event) => {
		const form = await event.request.formData();
		await deleteDocument(event.locals.ctx!, String(form.get('documentId') ?? ''), { db: getDb() });
		redirect(303, links.documents(event.params.slug));
	}
};

import { fail, type RequestEvent } from '@sveltejs/kit';
import { getDb } from '../db/index.js';
import { run } from '../http/form-action.js';
import { deleteVersion, replaceDocument, restoreVersion } from '../services/document-versions.js';
import { UploadRefused, receiveUpload } from './storage.js';

/**
 * Replace, restore and delete a version — the same three form actions on the
 * library and in the workspace, so they are written once. Each reads
 * `documentId` from the form, never from the route, because the library posts
 * for any row.
 */

export async function replaceAction(event: RequestEvent) {
	const form = await event.request.formData();
	const documentId = String(form.get('documentId') ?? '');
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return fail(400, { step: 'replace', error: 'Choose the newer file first.' });
	}
	return run('replace', async () => {
		let stored;
		try {
			stored = await receiveUpload(file, event.locals.ctx!.community.id);
		} catch (problem) {
			if (problem instanceof UploadRefused) return { refused: problem.reason };
			throw problem;
		}
		await replaceDocument(
			event.locals.ctx!,
			documentId,
			{ filename: file.name, file: stored },
			{ db: getDb() }
		);
		return { refused: null };
	});
}

export async function restoreAction(event: RequestEvent) {
	const form = await event.request.formData();
	return run('restore', () =>
		restoreVersion(
			event.locals.ctx!,
			String(form.get('documentId') ?? ''),
			String(form.get('versionId') ?? ''),
			{ db: getDb() }
		)
	);
}

export async function deleteVersionAction(event: RequestEvent) {
	const form = await event.request.formData();
	return run('deleteVersion', () =>
		deleteVersion(
			event.locals.ctx!,
			String(form.get('documentId') ?? ''),
			String(form.get('versionId') ?? ''),
			{ db: getDb() }
		)
	);
}

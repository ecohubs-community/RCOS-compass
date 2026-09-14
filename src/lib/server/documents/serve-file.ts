import { createReadStream, constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { absolutePathOf } from './storage.js';

/**
 * Serve a stored upload — a document's current file or one of its earlier
 * versions — with the one set of headers bytes a stranger chose may have.
 *
 * `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`
 * because rendering these inline on our own origin would hand an uploader a way
 * to run script in it. Shared by both file routes so a version can never be
 * served more loosely than the file it used to be. Authorisation is the
 * caller's: this is called with a row the caller was allowed to read.
 */
export async function serveStoredFile(file: {
	storageKey: string;
	mime: string;
	bytes: number;
	filename: string;
}): Promise<Response> {
	const path = absolutePathOf(file.storageKey);

	// Asked before the stream is built. `createReadStream` returns immediately
	// and reports a missing file as an `error` event, so wrapping it in a
	// try/catch caught nothing: a file that has gone answered 200 with a body that
	// failed mid-download rather than saying plainly that it is not there.
	try {
		await access(path, constants.R_OK);
	} catch {
		error(404, 'Not found');
	}

	return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
		headers: {
			'Content-Type': file.mime,
			'Content-Length': String(file.bytes),
			'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store'
		}
	});
}

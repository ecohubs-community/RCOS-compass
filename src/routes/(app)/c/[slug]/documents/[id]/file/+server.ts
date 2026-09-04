import { createReadStream, constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { absolutePathOf } from '$lib/server/documents/storage';
import { getDocument } from '$lib/server/services/documents';
import type { RequestHandler } from './$types';

/**
 * The file itself.
 *
 * No public path and no signed URL. The tenant is resolved by the pipeline like
 * every other route, membership is re-checked here, and the bytes are streamed
 * from disk — so a document is reachable exactly by the people who can reach the
 * community, and the answer for anyone else is the same as for a document that
 * does not exist.
 *
 * `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` because
 * this is the one route that serves bytes a stranger chose. Rendering them inline
 * on our own origin would hand an uploader a way to run script in it.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const found = getDocument(locals.ctx!, params.id, { db: getDb() });
	const path = absolutePathOf(found.storageKey);

	// Asked before the stream is built. `createReadStream` returns immediately
	// and reports a missing file as an `error` event, so wrapping it in a
	// try/catch caught nothing: a document whose file has gone — the crash the
	// purge job's orphan sweep exists for — answered 200 with a body that failed
	// mid-download rather than saying plainly that it is not there.
	try {
		await access(path, constants.R_OK);
	} catch {
		error(404, 'Not found');
	}

	return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
		headers: {
			'Content-Type': found.mime,
			'Content-Length': String(found.bytes),
			'Content-Disposition': `attachment; filename="${encodeURIComponent(found.filename)}"`,
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store'
		}
	});
};

import { createReadStream } from 'node:fs';
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
export const GET: RequestHandler = ({ locals, params }) => {
	const found = getDocument(locals.ctx!, params.id, { db: getDb() });

	let stream;
	try {
		stream = createReadStream(absolutePathOf(found.storageKey));
	} catch {
		error(404, 'Not found');
	}

	return new Response(Readable.toWeb(stream) as ReadableStream, {
		headers: {
			'Content-Type': found.mime,
			'Content-Length': String(found.bytes),
			'Content-Disposition': `attachment; filename="${encodeURIComponent(found.filename)}"`,
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store'
		}
	});
};

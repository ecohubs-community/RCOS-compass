import { getDb } from '$lib/server/db';
import { serveStoredFile } from '$lib/server/documents/serve-file';
import { getDocument } from '$lib/server/services/documents';
import type { RequestHandler } from './$types';

/**
 * The file itself.
 *
 * No public path and no signed URL. The tenant is resolved by the pipeline like
 * every other route, membership is re-checked here, and the bytes are streamed
 * from disk — so a document is reachable exactly by the people who can reach the
 * community, and the answer for anyone else is the same as for a document that
 * does not exist. The headers live with `serveStoredFile`, shared with the
 * version route.
 */
export const GET: RequestHandler = async ({ locals, params }) =>
	serveStoredFile(getDocument(locals.ctx!, params.id, { db: getDb() }));

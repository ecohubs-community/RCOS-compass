import { getDb } from '$lib/server/db';
import { serveStoredFile } from '$lib/server/documents/serve-file';
import { getVersion } from '$lib/server/services/document-versions';
import type { RequestHandler } from './$types';

/**
 * An earlier file of a document, so a member can see what a replacement
 * replaced before restoring it. Authorised through the document — a version is
 * as visible as the document it belongs to, and no more — and served with the
 * same headers as the current file.
 */
export const GET: RequestHandler = async ({ locals, params }) =>
	serveStoredFile(getVersion(locals.ctx!, params.id, params.versionId, { db: getDb() }));

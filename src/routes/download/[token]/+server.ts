import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { producedFile } from '$lib/server/db/schema/self-audit';
import { absolutePathOf } from '$lib/server/documents/storage';
import { recordAudit } from '$lib/server/services/audit';
import { verifyDownload } from '$lib/server/services/export';
import type { RequestHandler } from './$types';

/**
 * A signed download, outside every other authorisation path.
 *
 * The link exists so a steward can hand a bundle to an auditor or a lawyer
 * without giving them an account, which means the signature *is* the
 * authorisation. Three things follow: it is verified in constant time, it
 * expires within the hour, and every use is audit-logged — a link used twice is
 * visible afterwards rather than prevented, because single-use links are broken
 * by every mail scanner between here and the recipient and the failure looks
 * exactly like a bug.
 */
export const GET: RequestHandler = ({ params, getClientAddress, request }) => {
	const now = systemClock.now();
	const verified = verifyDownload(params.token, now);
	// One answer for a forged signature, an expired one and a file that has been
	// cleaned up: anything else is an oracle for which ids exist.
	if (!verified) error(404, 'Not found');

	const db = getDb();
	const file = db.select().from(producedFile).where(eq(producedFile.id, verified.fileId)).get();
	if (!file || file.expiresAt.getTime() <= now) error(404, 'Not found');

	recordAudit(db, systemClock, {
		action: 'community.exported',
		actorId: file.requestedBy,
		communityId: file.communityId,
		target: file.id,
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent'),
		meta: { filename: file.filename, bytes: file.bytes }
	});

	const stream = Readable.toWeb(
		createReadStream(absolutePathOf(file.storageKey))
	) as ReadableStream;

	return new Response(stream, {
		headers: {
			'content-type': 'application/zip',
			'content-length': String(file.bytes),
			'content-disposition': `attachment; filename="${file.filename}"`,
			// Signed and short-lived: a cache holding it would outlive the link.
			'cache-control': 'private, no-store'
		}
	});
};

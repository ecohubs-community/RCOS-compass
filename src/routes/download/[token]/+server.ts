import { error } from '@sveltejs/kit';
import { createReadStream, statSync } from 'node:fs';
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

	/**
	 * The file has to be there before we promise a body.
	 *
	 * `cleanUpExports` removes the file and then the row, so a crash between the
	 * two leaves a row pointing at nothing — its comment says the download path
	 * treats that as gone, and this is where that becomes true. Streaming a
	 * missing file instead sends a 200 with a `content-length` and no body, which
	 * a browser reports as a corrupt archive and a steward reads as "the export
	 * is broken".
	 */
	const path = absolutePathOf(file.storageKey);
	const onDisk = statSync(path, { throwIfNoEntry: false });
	if (!onDisk?.isFile()) error(404, 'Not found');

	recordAudit(db, systemClock, {
		action: 'community.exported',
		/**
		 * Who *fetched* it, which is not who asked for it.
		 *
		 * The link exists so a steward can hand a bundle to somebody without an
		 * account, so most uses have no actor at all. Recording the requester
		 * would put the steward's name against a download made by an auditor from
		 * their own address — answering the one question the log exists for with
		 * the wrong name. The requester is kept in `meta`, where it is a fact
		 * about the export rather than about this fetch.
		 */
		actorId: null,
		communityId: file.communityId,
		target: file.id,
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent'),
		meta: { filename: file.filename, bytes: onDisk.size, requestedBy: file.requestedBy }
	});

	const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;

	return new Response(stream, {
		headers: {
			'content-type': 'application/zip',
			'content-length': String(onDisk.size),
			'content-disposition': `attachment; filename="${file.filename}"`,
			// Signed and short-lived: a cache holding it would outlive the link.
			'cache-control': 'private, no-store'
		}
	});
};

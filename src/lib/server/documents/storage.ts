import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { getConfig } from '../config.js';
import { newId } from '../db/id.js';
import { SNIFF_BYTES, sniff, type AcceptedType } from './sniff.js';
import { declaredUnpackedSize } from './zip.js';

/**
 * Where an uploaded file goes, and the order it goes there in.
 * docs/04-security.md §5.1–5.2.
 *
 * The ordering is the design. A file is streamed to a **temporary** path under a
 * hard byte ceiling, and only moved into place as the last step of the
 * transaction that records it. So:
 *
 * - a rejected upload leaves nothing, because nothing was ever moved;
 * - a failed insert leaves nothing, because the move never happened;
 * - a crash mid-write leaves a temp file and no row, which a sweep can clear
 *   without touching anything a community can see.
 *
 * "Leaves no partial rows" is then a property of the sequence rather than of a
 * cleanup job that has to be right.
 */

export type StoredFile = {
	storageKey: string;
	type: AcceptedType;
	bytes: number;
	sha256: string;
	/** Call when the row could not be written. Removes the temp file. */
	discard: () => Promise<void>;
	/** Call inside the transaction, last. Moves the file into place. */
	commit: () => Promise<void>;
};

export class UploadRefused extends Error {
	constructor(readonly reason: string) {
		super(reason);
		this.name = 'UploadRefused';
	}
}

function uploadRoot(): string {
	return resolve(getConfig().UPLOAD_DIR);
}

/** Never a path the client supplied: a community id and a fresh id, both ours. */
export function storageKeyFor(communityId: string): string {
	return join(communityId, newId());
}

export function absolutePathOf(storageKey: string): string {
	const root = uploadRoot();
	const full = resolve(root, storageKey);
	// Belt and braces. `storageKey` is generated, never parsed from input, but a
	// path that escapes the root is the kind of bug that is catastrophic once and
	// cheap to make impossible forever.
	if (!full.startsWith(root + '/')) throw new Error('storage key escapes the upload root');
	return full;
}

/**
 * Stream a file to disk, refusing it the moment it disqualifies itself.
 *
 * The ceiling is enforced **while reading**, not after: buffering 25 MB to
 * measure it is how a size limit becomes a memory-exhaustion vector at
 * concurrency, and a 5 GB upload must cost 5 GB of nothing.
 */
export async function receiveUpload(
	file: { name: string; stream: () => ReadableStream<Uint8Array> },
	communityId: string
): Promise<StoredFile> {
	const config = getConfig();
	const ceiling = config.maxUploadBytes;

	const storageKey = storageKeyFor(communityId);
	const temporary = join(uploadRoot(), '.incoming', newId());
	await mkdir(dirname(temporary), { recursive: true });

	const hash = createHash('sha256');
	let bytes = 0;
	let head: Uint8Array | null = null;
	let sniffed: AcceptedType | null = null;

	const discard = async () => {
		await rm(temporary, { force: true });
	};

	const source = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);

	async function* guarded() {
		const seen: Uint8Array[] = [];
		let seenBytes = 0;

		for await (const chunk of source) {
			const bit = chunk as Uint8Array;
			bytes += bit.length;
			if (bytes > ceiling) {
				throw new UploadRefused(
					`That file is larger than ${config.MAX_UPLOAD_MB} MB. Compass keeps documents small enough to read quickly; split it or upload the part that matters.`
				);
			}

			// Decide what it is from the first few kilobytes, before the rest of it
			// is worth writing.
			//
			// The window is what matters, not the chunk. An earlier version also
			// decided as soon as `bytes === chunk.length`, meaning to catch "the
			// whole file arrived at once" — but that is true of the *first* chunk
			// of every upload, so the verdict was reached on whatever the first
			// chunk happened to contain. A `.docx` delivered in 64-byte pieces was
			// refused as "an archive of some other kind" because
			// `word/document.xml` had not appeared yet, and the same file over a
			// faster connection was accepted. A short file is identified after the
			// loop instead.
			if (head === null) {
				seen.push(bit);
				seenBytes += bit.length;
				if (seenBytes >= SNIFF_BYTES) {
					head = Buffer.concat(seen).subarray(0, SNIFF_BYTES);
					const verdict = sniff(file.name, head);
					if (!verdict.ok) throw new UploadRefused(verdict.reason);
					sniffed = verdict.type;
				}
			}

			hash.update(bit);
			yield bit;
		}

		// A file shorter than the sniff window still has to be identified.
		if (head === null) {
			head = Buffer.concat(seen);
			const verdict = sniff(file.name, head);
			if (!verdict.ok) throw new UploadRefused(verdict.reason);
			sniffed = verdict.type;
		}
	}

	try {
		await pipeline(guarded(), createWriteStream(temporary));
	} catch (problem) {
		await discard();
		throw problem;
	}

	if (bytes === 0) {
		await discard();
		throw new UploadRefused('That file is empty.');
	}

	/**
	 * The bomb check, which sniffing cannot do.
	 *
	 * A zip bomb built inside a docx **is** a docx — the format check accepts it
	 * and is right to. What gives it away is what the archive says it will
	 * become, read from its own central directory, so nothing is decompressed to
	 * find out that decompressing it is a bad idea.
	 */
	if (sniffed === 'docx' || sniffed === 'odt') {
		const declared = await declaredUnpackedSize(temporary);
		if (!declared) {
			await discard();
			throw new UploadRefused(
				'That file is damaged, or is not the Office document it claims to be.'
			);
		}
		if (declared.declaredBytes > config.MAX_UNZIP_MB * 1024 * 1024) {
			await discard();
			throw new UploadRefused(
				`That file unpacks to ${Math.round(declared.declaredBytes / 1024 / 1024)} MB, ` +
					`which is past the ${config.MAX_UNZIP_MB} MB limit. A document that small on disk and that large ` +
					'inside is not a document Compass will open.'
			);
		}
	}

	return {
		storageKey,
		type: sniffed!,
		bytes,
		sha256: hash.digest('hex'),
		discard,
		commit: async () => {
			const destination = absolutePathOf(storageKey);
			await mkdir(dirname(destination), { recursive: true });
			await rename(temporary, destination);
		}
	};
}

/** Remove a stored file. Deleting a document has to delete the document. */
export async function removeFile(storageKey: string): Promise<void> {
	await rm(absolutePathOf(storageKey), { force: true });
}

/** Everything a community holds, for the deletion path. */
export async function removeCommunityFiles(communityId: string): Promise<void> {
	await rm(join(uploadRoot(), communityId), { recursive: true, force: true });
}

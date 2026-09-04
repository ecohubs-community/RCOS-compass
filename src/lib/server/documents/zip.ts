import { open } from 'node:fs/promises';

/**
 * How big a zip claims it will become. docs/04-security.md §5.1.
 *
 * `.docx` and `.odt` are zips, and a zip can be small on disk and enormous
 * unpacked — 219 KB of compressed zeros becomes 220 MB. Sniffing cannot catch
 * that, and correctly does not try: a bomb built inside a docx **is** a docx,
 * structurally. The defence is a separate question asked of a different part of
 * the file.
 *
 * Asked of the archive's own central directory, which records each entry's
 * uncompressed size, so the answer costs a few kilobytes of reading and nothing
 * is decompressed to find it out. Answering it any other way means unpacking the
 * bomb to discover it was a bomb.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
/** The trailing record is 22 bytes plus a comment of at most 64 KB. */
const TAIL = 22 + 0xffff;

export type ZipSize = { declaredBytes: number; entries: number } | null;

/**
 * The total uncompressed size a zip declares, or null when the file is not a
 * readable zip — in which case the format check has already refused it.
 */
export async function declaredUnpackedSize(path: string): Promise<ZipSize> {
	const handle = await open(path, 'r');
	try {
		const { size } = await handle.stat();
		const tailLength = Math.min(size, TAIL);
		const tail = Buffer.alloc(tailLength);
		await handle.read(tail, 0, tailLength, size - tailLength);

		let end = -1;
		for (let i = tail.length - 22; i >= 0; i--) {
			if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
				end = i;
				break;
			}
		}
		if (end === -1) return null;

		const entries = tail.readUInt16LE(end + 10);
		const directorySize = tail.readUInt32LE(end + 12);
		const directoryOffset = tail.readUInt32LE(end + 16);
		if (directoryOffset + directorySize > size) return null;

		const directory = Buffer.alloc(directorySize);
		await handle.read(directory, 0, directorySize, directoryOffset);

		let declaredBytes = 0;
		let at = 0;
		let seen = 0;
		while (at + 46 <= directory.length && directory.readUInt32LE(at) === CENTRAL_FILE_HEADER) {
			declaredBytes += directory.readUInt32LE(at + 24);
			const nameLength = directory.readUInt16LE(at + 28);
			const extraLength = directory.readUInt16LE(at + 30);
			const commentLength = directory.readUInt16LE(at + 32);
			at += 46 + nameLength + extraLength + commentLength;
			seen += 1;
		}

		return { declaredBytes, entries: seen || entries };
	} finally {
		await handle.close();
	}
}

/**
 * Read one entry out of a zip, with a ceiling on what it may become.
 *
 * The upload check already refused archives whose *declared* sizes lie past the
 * ceiling, but the declaration and the reality are both attacker-controlled, so
 * the ceiling is enforced again here on the actual bytes produced. Extraction
 * never trusts the label on the tin twice.
 */
export async function readZipEntry(
	path: string,
	entryName: string,
	maxBytes: number
): Promise<Buffer | null> {
	const { inflateRawSync } = await import('node:zlib');
	const handle = await open(path, 'r');
	try {
		const { size } = await handle.stat();
		const tailLength = Math.min(size, TAIL);
		const tail = Buffer.alloc(tailLength);
		await handle.read(tail, 0, tailLength, size - tailLength);

		let end = -1;
		for (let i = tail.length - 22; i >= 0; i--) {
			if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
				end = i;
				break;
			}
		}
		if (end === -1) return null;

		const directorySize = tail.readUInt32LE(end + 12);
		const directoryOffset = tail.readUInt32LE(end + 16);
		if (directoryOffset + directorySize > size) return null;
		const directory = Buffer.alloc(directorySize);
		await handle.read(directory, 0, directorySize, directoryOffset);

		let at = 0;
		while (at + 46 <= directory.length && directory.readUInt32LE(at) === CENTRAL_FILE_HEADER) {
			const method = directory.readUInt16LE(at + 10);
			const compressedSize = directory.readUInt32LE(at + 20);
			const declaredSize = directory.readUInt32LE(at + 24);
			const nameLength = directory.readUInt16LE(at + 28);
			const extraLength = directory.readUInt16LE(at + 30);
			const commentLength = directory.readUInt16LE(at + 32);
			const localOffset = directory.readUInt32LE(at + 42);
			const name = directory.toString('utf8', at + 46, at + 46 + nameLength);

			if (name === entryName) {
				if (declaredSize > maxBytes) return null;

				// The local header repeats the name and extra fields with its own
				// lengths, which may differ from the central directory's copy.
				const local = Buffer.alloc(30);
				await handle.read(local, 0, 30, localOffset);
				if (local.readUInt32LE(0) !== 0x04034b50) return null;
				const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);

				const compressed = Buffer.alloc(compressedSize);
				await handle.read(compressed, 0, compressedSize, dataStart);

				if (method === 0) return compressed;
				if (method !== 8) return null;
				// `maxOutputLength` is the enforcement: however well the bytes
				// compress, inflation stops at the ceiling by throwing.
				return inflateRawSync(compressed, { maxOutputLength: maxBytes });
			}

			at += 46 + nameLength + extraLength + commentLength;
		}
		return null;
	} finally {
		await handle.close();
	}
}

/**
 * The parsing half of extraction, run inside a worker thread.
 *
 * This file is plain JavaScript on purpose. It is loaded as a *string* (Vite's
 * `?raw`) and handed to `new Worker(code, { eval: true })`, which is what makes
 * the same bytes work in every environment this project runs in — vitest, the
 * dev server, and the adapter-node build — without asking the bundler to emit a
 * separate worker chunk it has no reliable way to address. Eval'd worker code
 * runs as CommonJS, so this file uses `require`, and resolves the two parsing
 * dependencies from wherever the importing module actually lives
 * (`workerData.resolveFrom`), not from the working directory.
 *
 * Only *parsing* happens here: the hostile file becomes inert data — text
 * items with positions for a PDF, an HTML string for Word, an XML string for
 * ODT, plain text otherwise — and every heuristic that turns that into
 * passages stays in `extract.ts`, typed and unit-testable. The worker is the
 * isolation boundary: the parent terminates it at the deadline, and
 * `resourceLimits` caps what a decompression or parser bug can allocate.
 *
 * It deliberately imports nothing from the application, so the zip reading
 * below is the *only* reader of a zip entry's bytes in the product — `zip.ts`
 * keeps just the declared-size check the upload envelope asks before any file is
 * kept. Its bounds are tested through the extraction suite's hostile zips.
 */
// @ts-nocheck — eval'd CommonJS with untyped `require`; the type-checked
// contract lives in extract.ts, and the behaviour in the extraction tests.
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
const fs = require('node:fs/promises');
const zlib = require('node:zlib');

const resolveFrom = workerData.resolveFrom;

/** Resolve a dependency the way the importing module would. */
const load = (name) => createRequire(resolveFrom)(name);

async function pdfRaw(path, maxPages) {
	const { getDocumentProxy } = load('unpdf');
	const bytes = new Uint8Array(await fs.readFile(path));
	const pdf = await getDocumentProxy(bytes);
	const pagesTotal = pdf.numPages;
	const upTo = Math.min(pagesTotal, maxPages);

	const pages = [];
	for (let number = 1; number <= upTo; number++) {
		const page = await pdf.getPage(number);
		const [x0, y0, x1, y1] = page.view;
		const content = await page.getTextContent();
		pages.push({
			width: x1 - x0,
			height: y1 - y0,
			// `[str, x, y, width, fontHeight]` — see RawItem in extract.ts. Blank
			// runs are dropped here so they never cross the boundary at all.
			items: content.items
				.filter((item) => typeof item.str === 'string' && item.str.trim().length > 0)
				.map((item) => {
					const t = item.transform;
					const fontH = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || item.height || 10;
					return [item.str, t[4], t[5], item.width || 0, fontH];
				})
		});
		if (typeof page.cleanup === 'function') page.cleanup();
	}
	return { kind: 'pdf', pagesTotal, pages };
}

async function docxRaw(path) {
	const mammoth = load('mammoth');
	const result = await mammoth.convertToHtml({ path });
	return { kind: 'docx', html: result.value };
}

/**
 * One entry out of a zip, with a ceiling on what it may become.
 *
 * Every length and offset in a zip is attacker-controlled, so each is checked
 * against the file's real size *before* anything is allocated from it: a
 * `Buffer` lives outside the V8 heap, where the worker's `resourceLimits`
 * cannot see it, and a declared compressed size of 4 GiB would otherwise be
 * zero-filled in memory shared with the whole server.
 */
async function readZipEntry(path, entryName, maxBytes) {
	const TAIL = 22 + 0xffff;
	const handle = await fs.open(path, 'r');
	try {
		const { size } = await handle.stat();
		const tailLength = Math.min(size, TAIL);
		const tail = Buffer.alloc(tailLength);
		await handle.read(tail, 0, tailLength, size - tailLength);

		let end = -1;
		for (let i = tail.length - 22; i >= 0; i--) {
			if (tail.readUInt32LE(i) === 0x06054b50) {
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
		while (at + 46 <= directory.length && directory.readUInt32LE(at) === 0x02014b50) {
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
				if (localOffset + 30 > size) return null;
				const local = Buffer.alloc(30);
				await handle.read(local, 0, 30, localOffset);
				if (local.readUInt32LE(0) !== 0x04034b50) return null;
				const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
				// The compressed bytes must actually be in the file.
				if (dataStart + compressedSize > size) return null;
				const compressed = Buffer.alloc(compressedSize);
				await handle.read(compressed, 0, compressedSize, dataStart);
				if (method === 0) return compressed;
				if (method !== 8) return null;
				try {
					return zlib.inflateRawSync(compressed, { maxOutputLength: maxBytes });
				} catch {
					// However well the bytes compress, inflation stops at the ceiling.
					return null;
				}
			}
			at += 46 + nameLength + extraLength + commentLength;
		}
		return null;
	} finally {
		await handle.close();
	}
}

async function odtRaw(path, maxUnzipBytes) {
	const content = await readZipEntry(path, 'content.xml', maxUnzipBytes);
	return { kind: 'odt', xml: content ? content.toString('utf8') : null };
}

async function textRaw(path, kind) {
	return { kind, text: await fs.readFile(path, 'utf8') };
}

(async () => {
	const { path, type, limits } = workerData;
	try {
		let raw;
		if (type === 'pdf') raw = await pdfRaw(path, limits.maxPages);
		else if (type === 'docx') raw = await docxRaw(path);
		else if (type === 'odt') raw = await odtRaw(path, limits.maxUnzipBytes);
		else raw = await textRaw(path, type === 'md' ? 'md' : 'txt');
		parentPort.postMessage({ ok: true, raw });
	} catch (problem) {
		// The code travels with the message: ENOENT or MODULE_NOT_FOUND is about
		// the machine, and the parent must not report it as a damaged file.
		parentPort.postMessage({
			ok: false,
			message: String((problem && problem.message) || problem),
			code: (problem && typeof problem.code === 'string' && problem.code) || null
		});
	}
})();

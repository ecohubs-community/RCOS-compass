import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * pdf.js, loaded only when the original view is asked for, with every option
 * that decides what a hostile file can do set here and nowhere else.
 * `openspec/changes/document-original-view`, design.md "Loading options" and the
 * spike findings recorded there.
 *
 * - **No evaluation.** pdf.js 6 compiles no font code and has no
 *   `isEvalSupported` switch left to turn off; the CSP has no `unsafe-eval` for
 *   it to need either.
 * - **No scripting, no forms, no links.** `pdf.sandbox` is never imported, XFA is
 *   off, and pages render with annotations disabled — no annotation layer exists.
 * - **No WebAssembly.** `useWasm: false` and no `wasmUrl`: JPEG 2000 and JBIG2
 *   images (rare in bylaws) render blank rather than the policy gaining
 *   `wasm-unsafe-eval` or the worker importing decoder scripts.
 * - **Limits.** Decoded images above 16 MP are skipped; the canvas cap lives in
 *   `geometry.ts`.
 * - **Our origin only.** Worker, standard fonts and CMaps come from `/_app/`;
 *   the file itself from the member-only route, cookies and all.
 */

let library: Promise<typeof import('pdfjs-dist')> | null = null;

function pdfjs() {
	library ??= Promise.all([
		import('pdfjs-dist'),
		import('pdfjs-dist/build/pdf.worker.min.mjs?url')
	]).then(([lib, worker]) => {
		lib.GlobalWorkerOptions.workerSrc = worker.default;
		return lib;
	});
	return library;
}

export const MAX_IMAGE_PIXELS = 16_000_000;

export async function openPdf(url: string): Promise<{
	pdf: PDFDocumentProxy;
	lib: typeof import('pdfjs-dist');
}> {
	const lib = await pdfjs();
	const pdf = await lib.getDocument({
		url,
		enableXfa: false,
		useWasm: false,
		maxImageSize: MAX_IMAGE_PIXELS,
		useSystemFonts: false,
		standardFontDataUrl: `${__PDFJS_ASSET_BASE__}standard_fonts/`,
		cMapUrl: `${__PDFJS_ASSET_BASE__}cmaps/`,
		cMapPacked: true,
		stopAtErrors: false,
		verbosity: 0
	}).promise;
	return { pdf, lib };
}

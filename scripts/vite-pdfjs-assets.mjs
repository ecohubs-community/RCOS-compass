import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * pdf.js's standard fonts and character maps, served from our own origin.
 * `openspec/changes/document-original-view`, design.md "Loading options".
 *
 * pdf.js fetches these by *name* — `standardFontDataUrl + "FoxitSerif.pfb"` —
 * so they cannot go through Vite's asset pipeline, which fingerprints every
 * file. They are copied as they are under a directory named for the pinned
 * version instead: immutable for as long as that version is, and a version bump
 * is a new path, never a stale cache. In development the same path is answered
 * straight from `node_modules`.
 *
 * Nothing here is inlined as a `data:` URL: `connect-src 'self'` would refuse
 * to fetch it.
 */
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('pdfjs-dist/package.json'));
/** @type {string} */
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

/** Where the browser finds them, trailing slash included, as pdf.js wants. */
export const PDFJS_ASSET_BASE = `/_app/immutable/pdfjs-${version}/`;
const DIRECTORIES = ['standard_fonts', 'cmaps'];

/** @returns {import('vite').Plugin} */
export function pdfjsAssets() {
	return {
		name: 'compass:pdfjs-assets',
		config: () => ({
			define: { __PDFJS_ASSET_BASE__: JSON.stringify(PDFJS_ASSET_BASE) }
		}),
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const url = request.url?.split('?')[0] ?? '';
				if (!url.startsWith(PDFJS_ASSET_BASE)) return next();
				const [directory, name] = url.slice(PDFJS_ASSET_BASE.length).split('/');
				if (!DIRECTORIES.includes(directory ?? '') || !name) {
					return next();
				}
				if (name.includes('..') || name.includes('\\')) return next();
				try {
					response.setHeader('Content-Type', 'application/octet-stream');
					response.end(readFileSync(join(root, directory ?? '', name)));
				} catch {
					next();
				}
			});
		},
		generateBundle() {
			// The client bundle only: the server never renders a PDF.
			if (this.environment?.name !== 'client') return;
			for (const directory of DIRECTORIES) {
				for (const name of readdirSync(join(root, directory))) {
					if (name.startsWith('LICENSE')) continue;
					this.emitFile({
						type: 'asset',
						fileName: `${PDFJS_ASSET_BASE.slice(1)}${directory}/${name}`,
						source: readFileSync(join(root, directory, name))
					});
				}
			}
		}
	};
}

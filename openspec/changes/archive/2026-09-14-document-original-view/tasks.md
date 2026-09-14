## 1. Spike

- [x] 1.1 Pick the newest stable `pdfjs-dist` at or above the CVE-2024-4367 fix; note in the PR why it beats writing it
- [x] 1.2 In a throwaway dev route under the real CSP, load normal, rotated, cropped and hostile fixtures with the options in `design.md`; confirm the minimum CSP change and whether any decoder needs WebAssembly (disable it if so)
- [x] 1.3 Compare stored `bbox` line boxes against the client viewport for the normal, rotated and cropped pages
- [x] 1.4 Record version, options, CSP delta, decoder decision and alignment findings in `design.md`; delete the route

## 2. Dependency, build and policy

- [x] 2.1 Add `pdfjs-dist` pinned exactly; import the worker via `?url`; copy standard fonts and CMaps into the client build
- [x] 2.2 Add `worker-src 'self'` to `svelte.config.js`
- [x] 2.3 Tests: `security-headers.test.ts` asserts `worker-src 'self'` and that `script-src` has no `unsafe-` source or host; a build test asserts the worker, fonts and CMaps are emitted under `/_app/`

## 3. The viewer

- [x] 3.1 `PdfViewer`: dynamic import for `view=original` on PDFs; `getDocument` with eval off, no XFA, image-size cap, self-hosted fonts and CMaps; render with annotations disabled and a canvas-pixel cap; text layer; render nearby pages only and clean up distant ones
- [x] 3.2 Toolbar: page N of M with previous / next in `?page=`, zoom (fit width, ±10% within 50–300%), Original / Text switch in `?view=`
- [x] 3.3 Fallback: on any load or render failure keep `PaperView` with the sentence and download link; log without the filename
- [x] 3.4 Text-layer stylesheet imported under the `docs/02` third-party-surface exception, scoped to the viewer, with no colours of its own
- [x] 3.5 Tests: e2e opens a PDF at the URL's page; switching to text keeps the page; a fixture that fails to parse shows the text fallback with the sentence; the no-JS project shows the text view; a `.docx` offers no original control

## 4. Highlights and selection

- [x] 4.1 Highlight layer: line boxes through `convertToViewportRectangle`, excerpt lines by range overlap, one labelled `<button>` per passage, state styling matching `PaperView`
- [x] 4.2 Two-way selection through `?passage=` with scroll-into-view, without feedback loops into `?page=`
- [x] 4.3 Load exposes `bbox` for PDF passages
- [x] 4.4 Tests: a unit test maps a stored line box to viewport rectangles for rotation 0/90/180/270 and a cropped page; e2e activating a highlight selects its card and URL; selecting a card on page 7 scrolls and selects its highlight; an excerpt inside the second of three lines highlights only that line; keyboard focus reaches each highlight with its label

## 5. Thumbnails

- [x] 5.1 `PageThumbnails`: lazy 44px canvases, page numbers, governance markers, current page outline, links to `?page=`
- [x] 5.2 Tests: markers on exactly the governance pages of a fixture; clicking a thumbnail shows that page; thumbnails beyond the strip's viewport are not rendered until scrolled to

## 6. Hostile files

- [x] 6.1 Fixtures: a PDF with document-level JavaScript and an external URI link annotation; a PDF with an oversized image; a PDF with a malformed font
- [x] 6.2 Tests: e2e with `securitypolicyviolation` and navigation listeners that fail the test; assert no link element from the file exists, no dialog or navigation occurs, and the oversized-image page renders while the page stays responsive

## 7. Phone entry point, gallery and a11y

- [x] 7.1 Queue: "View original page" link beside "see it in the page" for PDFs, opening `?view=original&page=N` at fit width
- [x] 7.2 Gallery entries for `PdfViewer` (with highlights) and `PageThumbnails`
- [x] 7.3 Tests: at 375 the link opens the page at fit width; a11y scan of the original view at 1024 and 1440

## 8. Documentation

- [x] 8.1 `docs/00-architecture.md` §8: the viewer as built, the pinned version and its options
- [x] 8.2 `docs/04-security.md` §7: `worker-src 'self'` and the rendering hardening
- [x] 8.3 `docs/08-roadmap-mvp.md` P4: the viewer with highlights has landed

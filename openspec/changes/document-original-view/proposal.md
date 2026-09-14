## Why

After `document-mapping-workspace`, a member maps a PDF against its extracted
text: accurate, accessible, and not the document they uploaded. Bylaws have
layout, numbering, tables, signatures and stamps, and people recognise their
document by how it looks. Design 05 shows the page as uploaded, with page
thumbnails, zoom and the mapped sentences highlighted in place.
`docs/00-architecture.md` §8 named a self-hosted `pdfjs-dist` viewer for this; P4
deferred it.

What a community loses without this: every PDF feels like a copy. When
extraction splits a table or a two-column page oddly, the member has no way to
check it against the original on screen short of downloading the file and
comparing by eye.

Last of three changes. It needs `document-paragraphs` (line boxes in `bbox`) and
`document-mapping-workspace` (workspace, selection in `?passage=`, highlight
states).

Reasoning: `docs/00-architecture.md` §8, `docs/04-security.md` §5.2 (untrusted
documents) and §7 (CSP and dependencies), `docs/02-component-guidelines.md`
(third-party surfaces), `design_files/platform/RCOS Compass.dc.html` screen 05.

## What Changes

- **An Original view for PDFs** in the workspace. It is the default for an
  extracted PDF at 1024px and wider, with a switch to the Text view, both in
  `?view=`. It renders pages with `pdfjs-dist` in the browser with a text layer.
- **Page thumbnails** in the side strip, rendered lazily, with a marker on pages
  holding identified passages. Page N of M and previous/next in `?page=`. Zoom:
  fit width, then ±10%.
- **Highlights on the page** from passage line boxes: the whole passage, or only
  the lines an excerpt spans. Open and confirmed are distinguished by more than
  colour, and selected has an outline. Selecting a highlight selects its card and
  the other way round, through the existing `?passage=`.
- **Hardened rendering of a hostile file:**
  - a pinned `pdfjs-dist` at or above the CVE-2024-4367 fix;
  - `isEvalSupported: false`, no PDF scripting, no XFA, no annotation layer (no
    document link is ever clickable);
  - limits on image size and canvas pixels;
  - worker, standard fonts and CMaps served from our origin.

  The file keeps coming from the member-only route as an attachment.
- **CSP gains `worker-src 'self'`.** Under `'strict-dynamic'`, `'self'` in
  `script-src` doesn't cover a Worker. `script-src` gains nothing, and no
  `unsafe-*` is added anywhere.
- **Fallbacks:** without JavaScript, and when rendering fails, the pane shows the
  Text view with a sentence and the download link. It is never blank. The queue
  below 1024px keeps the Text view for "see it in the page", and offers "View
  original page" as a link into the workspace view.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `document-viewer` (created by `document-mapping-workspace`): adds the original
  PDF view, thumbnails and zoom, line-level highlights and selection in it, and
  the rules for rendering an uploaded file in the browser.

## Impact

- **Dependency:** `pdfjs-dist`, pinned exactly; the PR says why it beats writing
  it (`docs/04` §7).
- **Client:** `PdfViewer` and `PageThumbnails` components, dynamically imported
  only for `view=original`; the view switch and page strip in the workspace; the
  pdf.js text layer stylesheet under the third-party-surface exception in
  `docs/02`.
- **Build:** worker via `?url`; standard fonts and CMaps copied into the client
  build.
- **Config:** `svelte.config.js` CSP `worker-src 'self'`, asserted in
  `tests/unit/security-headers.test.ts`.
- **Server:** the workspace load exposes `bbox` for PDF passages. No new routes.
- **Tests:**
  - e2e with a hostile PDF fixture (document JavaScript, a URI link annotation,
    an oversized image), failing on any CSP violation or navigation;
  - highlight and selection sync;
  - thumbnail markers; page and zoom;
  - a line-box coordinate test for normal, rotated and cropped pages;
  - the Text fallback when rendering throws and without JavaScript;
  - the a11y scan of the original view at 1024 and 1440;
  - gallery entries.
- **Out of scope:** rendering Word or ODT as their original layout, annotating,
  searching inside the canvas beyond the browser's find on the text layer, and
  range requests on the file route.

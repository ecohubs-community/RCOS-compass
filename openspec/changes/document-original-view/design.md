## Context

- `document-paragraphs` stores, for each PDF passage, `bbox` as an array of line
  boxes `{ x, y, w, h, start, end }`. The boxes are in unrotated PDF user-space
  points, origin bottom-left; the ranges are offsets into `passage.text`.
- `document-mapping-workspace` builds the two-pane workspace on `PaperView`, keeps
  selection in `?passage=` and the page in `?page=`, and defines highlight states
  (open, confirmed, selected) and excerpts.
- The CSP is nonce-based with `script-src 'self' 'strict-dynamic'`,
  `style-src 'self'`, `style-src-attr 'unsafe-inline'`,
  `img-src 'self' data: blob:`, `font-src 'self'`, `connect-src 'self'`, and no
  `worker-src`. Under CSP3, `'strict-dynamic'` makes browsers ignore `'self'` and
  host sources in `script-src`, and `worker-src` falls back to `script-src`, so a
  same-origin Worker isn't covered today.
- The file route serves `Content-Disposition: attachment`, `nosniff`,
  `Cache-Control: private, no-store`, and no range support.
- pdf.js has had a script-execution vulnerability through font handling
  (CVE-2024-4367), which `isEvalSupported: false` closes.

## Goals / Non-Goals

**Goals:**

- The uploaded PDF, rendered faithfully, with thumbnails, paging and zoom.
- Highlights and two-way selection consistent with the Text view.
- No execution path from file contents, and no loosening of `script-src`.
- A pane that is never blank.

**Non-Goals:**

- Word or ODT original layout; annotation; PDF forms; printing from the viewer.
- Highlights finer than a line.
- Range requests or caching on the file route.
- The original view below 1024px.

## Decisions

### Spike first, then pin

Task 1 is a throwaway route that loads the fixtures under the real CSP. It
establishes:

- the exact `pdfjs-dist` version, the newest stable one at or above the CVE fix;
- the `getDocument` options that version supports for the settings below;
- whether any bundled image decoder needs WebAssembly. If it does, that decoder is
  disabled, an affected image renders as blank, and `'wasm-unsafe-eval'` is not
  added;
- whether line boxes from the server's pdf.js (inside `unpdf`) and the client's
  viewport transform agree on a normal, a rotated and a cropped page.

The findings are written into this document before any component is built. The
version is pinned exactly, and upgrades are deliberate PRs.

### Spike findings (recorded before building)

- **Version: `pdfjs-dist` 6.3.289**, the newest stable at the time, far past the
  CVE-2024-4367 fix (4.2.67). It beats writing a viewer: a PDF renderer is fonts,
  colour spaces, image codecs and a content-stream interpreter, and the one in
  every browser already is pdf.js.
- **`isEvalSupported` is gone.** pdf.js 6 no longer compiles glyph programs into
  functions, so there is no eval path to switch off and the option no longer
  exists; the CSP has no `unsafe-eval` either way.
- **`convertToViewportRectangle` is gone.** Line boxes are mapped through the
  viewport's `transform` applied to both corners — exactly what
  `convertToViewportPoint` does — in `geometry.ts`, with a unit test comparing
  against pdf.js's own viewports at 0/90/180/270° and on a cropped page.
- **Decoders.** JPEG 2000, JBIG2 and ICC colour support use WebAssembly, with
  JS fallbacks the worker would `import()` from `wasmUrl`. Decision:
  `useWasm: false` and **no `wasmUrl`** — those images render blank, no
  `wasm-unsafe-eval`, and the worker imports nothing.
- **Fonts and CMaps** are fetched by name, so Vite's fingerprinting can't serve
  them; `scripts/vite-pdfjs-assets.mjs` copies them under
  `/_app/immutable/pdfjs-6.3.289/` in the client build and serves the same path
  in development.
- **CSP delta:** `worker-src 'self'` only. Verified under the production build's
  policy with a `securitypolicyviolation` listener: the worker, fonts, CMaps,
  canvas and text layer load with no violation.
- **Alignment:** stored boxes are in raw user space (the text item's transform),
  so the page viewport carries crop and rotation — the cropped fixture's boxes
  land 50px in from the visible edge, as its CropBox says. Box height is taken
  from 22% below the baseline to 92% of the font height above it, so descenders
  and capitals sit inside the highlight.

### Loading options

```
getDocument({
  url: fileRoute,             // same-origin, cookies sent
  enableXfa: false,
  useWasm: false,             // no wasmUrl: no WebAssembly, no decoder imports
  maxImageSize: 16_000_000,   // pixels per decoded image
  useSystemFonts: false,
  standardFontDataUrl, cMapUrl, cMapPacked: true,   // our origin
})
// (isEvalSupported no longer exists in pdf.js 6 — see the spike findings)
page.render({ canvasContext, viewport, annotationMode: AnnotationMode.DISABLE })
```

- **Scripting.** `pdf.sandbox` is never imported, and no scripting manager is
  created.
- **No annotation layer.** Links, forms and widgets are neither drawn nor made
  interactive. A PDF can't give a member a link to click.
- **Canvas size.** The canvas is capped by computing the render scale so
  `width × height × devicePixelRatio²` stays under ~16 MP. Above that, pages
  render at lower resolution.
- **Worker.** `GlobalWorkerOptions.workerSrc` is the `?url` import of
  `pdf.worker.min.mjs`, so Vite fingerprints it and serves it from `/_app/`.
- **Fonts.** pdf.js loads embedded fonts through the `FontFace` API from bytes,
  not URLs, so `font-src` isn't involved. Standard fonts and CMaps are fetched from
  our origin under `connect-src 'self'`.

### CSP: add `worker-src 'self'`, nothing else

`worker-src 'self'` is added in `svelte.config.js`. `script-src` is unchanged. The
text layer positions spans with style attributes, which `style-src-attr` already
allows. Canvas output never becomes an `<img>`, but thumbnails may use
`toBlob` → `blob:` URLs, which `img-src` already allows.

`security-headers.test.ts` asserts `worker-src` and asserts that `script-src`
contains no `unsafe-*` and no host.

### Components

- **`PdfViewer`** (tier 2, client-only), dynamically imported by the workspace when
  `view=original` and the document is a PDF.
  - Server rendering emits `PaperView` in the same pane, and the viewer replaces it
    after mount and a successful `getDocument`.
  - An `IntersectionObserver` renders pages within one screen of the viewport and
    `cleanup()`s pages further away.
  - Each page is a positioned container holding a canvas, the text layer, and a
    highlight layer.
- **Highlight layer.** For each identified passage on the page:
  - boxes are mapped with `viewport.convertToViewportRectangle([x, y, x + w, y + h])`,
    normalising min/max;
  - a passage with an excerpt uses only lines whose `[start, end)` overlaps it;
  - each highlight is a `<button>` over the union of its line boxes, labelled with
    the passage's first words and state, so keyboard and screen-reader users can
    reach it;
  - colours are Tailwind tokens; geometry is the only style attribute;
  - states match `PaperView`: open (dashed underline edge), confirmed (solid edge),
    selected (outline).
- **`PageThumbnails`.** Canvases at a fixed width of 44 CSS px, rendered lazily
  while visible in the strip, each with its page number, a governance marker for
  pages in the workspace's governance-pages set, and the current page outlined.
  They are links to `?page=`.
- **Deviations from the mock, recorded:** the strip scrolls instead of showing
  the mock's fixed seven thumbnails with a `+4` overflow row, and the sheet's
  own "— 4 —" page footer belongs to the rendered PDF, not to us.
- **Toolbar.** Page N of M with previous/next (links to `?page=`) and zoom
  (fit width, −, +, in 10% steps between 50% and 300%). Zoom is component state,
  not in the URL. The Original / Text switch is links to `?view=`.

### Selection and scrolling

- **From a highlight:** activating it sets `?passage=` with `replaceState`, which
  the workspace already turns into a selected card.
- **From a card:** the viewer reads `?passage=`, scrolls its page into view, then
  scrolls the highlight to about a third from the top.
- **From a page link or "Jump to next unmapped passage":** the page is scrolled
  into view.
- **Cycles:** a scroll the viewer caused doesn't feed back into `?page=` until
  the member scrolls themselves.

### Falling back to text

- **Rendering fails.** If `getDocument` or a page render throws (malformed file,
  an out-of-range size, a blocked worker), the viewer unmounts, and the pane keeps
  `PaperView` with "This PDF couldn't be shown as it was uploaded. Here is its
  text; you can download the original." The failure goes to the client error log
  without the file name.
- **No JavaScript.** The server-rendered `PaperView` stays.
- **Below 1024px.** No viewer. The queue's "see it in the page" uses the Text
  view, and adds "View original page" linking to `?view=original&page=N`, which
  renders at fit width.

### Why not the alternatives

- **Server-rendered page images:** a native canvas dependency on the server, no
  text layer, a round trip for every zoom, and rendering hostile files in our
  process instead of the member's sandboxed tab.
- **The browser's built-in PDF viewer in an `<iframe>`/`<embed>`:** it needs the
  file served inline from our origin, which `docs/04` forbids for uploaded bytes.
  It runs the browser's own PDF scripting settings, and we can't draw highlights
  on it or read selection from it.
- **A third-party viewer bundle** (e.g. the full `pdf.js` viewer app): pulls in
  its own UI, localisation and annotation features we would have to disable one by
  one.

## Risks / Trade-offs

- **[A future pdf.js flaw executes code from a crafted PDF]** → Eval is off,
  scripting and annotations are absent, the version is pinned with deliberate
  upgrades, and the CSP has no `unsafe-*`. The e2e hostile fixture fails on any
  CSP violation or navigation.
- **[A heavy PDF freezes a member's tab]** → Image-size and canvas-pixel caps,
  only nearby pages rendered, and page cleanup. The worker keeps parsing off the
  main thread.
- **[Bundle weight, ~1 MB worker]** → Loaded only for `view=original`; the Text
  view and queue never load it.
- **[`no-store` re-downloads the file on each visit]** → Bounded by the upload
  ceiling. Private caching or ranges are a later optimisation that doesn't touch
  the headers that matter for safety.
- **[Line boxes misaligned on unusual pages (rotation, crop boxes, user units)]**
  → Stored in unrotated user space and mapped by pdf.js's own viewport. The spike
  and a coordinate test cover rotated and cropped pages. A misaligned highlight
  is still labelled and selectable, and the Text view is one click away.
- **[Accessibility of canvas content]** → The pdf.js text layer carries the text,
  highlights are labelled buttons, and the Text view is the documented accessible
  alternative.

## Migration Plan

No data migration. Ship `worker-src 'self'` with the viewer; without the viewer,
the directive is harmless. Rollback removes the viewer and leaves the Text view,
which this change doesn't alter.

## Open Questions

_None._ The spike's findings (version, decoder, alignment) are recorded here
before implementation.

## Context

The document screen has two views of a PDF. The **text view** (`PaperView`) is
server-rendered and shows one page. Selecting words inside a paragraph there calls
`onexcerpt`: the page turns the words into `{passageId, start, end}` by regex
against the passage text and shows `HandMapCard`, which posts to `?/map`. The
**original view** (`PdfViewer` → `PdfPage`) draws every page with a canvas and
pdf.js's `TextLayer`. Its only interactive elements are the highlight buttons of
identified passages. Selecting text there does nothing.

What the original view has to work with today:

- `workspaceView.highlights` carries line boxes (`{x,y,w,h,start,end}` in
  unrotated PDF user space, from `document-paragraphs`) **only for passages that
  have claims**.
- `data.paper` carries passage **text only for the page in the URL**. The viewer
  scrolls through all pages, so a selection is usually on a page whose text the
  client does not have.
- `geometry.ts` maps line boxes to CSS pixels through the page's viewport
  transform, but has no inverse.
- `reveal()` places a selected passage through its highlight. A passage with no
  highlight falls through to "scroll to its page", so the view jumps away from
  the paragraph the member just clicked.
- The server save path is complete. `mapPassage` validates an excerpt range
  against the passage text, and headings are refused.

The two text sources agree more than they might seem to. The extractor and the
`TextLayer` both use pdf.js text content with default normalisation (ligatures
expanded, and so on), from the same pinned `pdfjs-dist`. They disagree in three
ways: whitespace (line breaks, and the extractor's word-gap spacing), words
hyphenated across a line (the extractor rejoins them), and the order runs come in
(irrelevant once the match ignores whitespace).

## Goals / Non-Goals

**Goals:**
- Select words, or click a paragraph, in the original view, and reach the same
  `HandMapCard` the text view reaches, with the right excerpt.
- One excerpt matcher for both views, which picks the occurrence the member
  selected.
- No new endpoint, no schema change, no change to the save path or the
  extractor's output.

**Non-Goals:**
- Selection in the original view below 1024px, where it is reached only from the
  queue's "view original page".
- Mapping words inside a passage that already has a claim, which neither view
  offers today.
- Storing per-glyph positions, or bumping `EXTRACTOR_VERSION`.
- A keyboard route to select words inside the PDF (Open Questions).

## Decisions

### 1. Line boxes for every PDF paragraph, sent through `load`

`workspaceView` gains `paragraphLines: { passageId, page, lines: LineTuple[] }[]`
for every **paragraph** passage of a PDF (headings excluded, so a heading cannot
be hit). It is empty for other formats. A line travels as
`[x, y, w, h, start, end]` with coordinates rounded to 0.1 pt, and one
`lineBox()` in `geometry.ts` turns it back into a `LineBox`. `highlights` stops
carrying its own `lines` and refers to the same passages by id, so no line is
sent twice. `paragraphLines` carries no text: the only passage words from other
pages remain the highlight labels' opening words, as today.

- *Alternative: a `+server.ts` that returns one page's lines on demand.* Not one
  of the seven cases in `docs/01` §2, and it adds a fetch-and-cache layer for data
  that is small for real governance documents.
- *Alternative: send everything, text included.* That roughly doubles the page
  for text the client only needs once it has navigated, and the load already
  returns that text then (Decision 3).
- Size, measured: a stored line box is 78 bytes of JSON. As a rounded tuple it is
  about 30, so roughly 12 KB for a 10-page document and about 360 KB at the
  300-page extraction ceiling. See Risks.
- *Alternative: rounded objects.* About 55 bytes a line, nearly twice the
  tuples, to avoid one converter.

### 2. Hit-testing a selection: geometry picks the paragraph

`PdfViewer` reads `window.getSelection()` when a selection **settles**: on
`pointerup` for a mouse, and after `selectionchange` has been quiet for 400 ms
for touch, where adjusting the selection handles fires no `pointerup`. Both call
the same handler, which ignores a selection it has already reported (same
anchor, focus and offsets) and any selection outside the scroller. At 1024px and
wider this includes tablets in landscape, where the original view is the
default.

```
range ─▶ getClientRects() ─▶ first rect, last rect
          │  relative to the [data-page] element each one is in
          ▼
      inverse(scaled(size.transform, scale))   ← new in geometry.ts
          ▼
      point in PDF user space ─▶ which paragraph line box contains it
                                 (the same BELOW/ABOVE padding lineRect uses;
                                  nearest box within half a line otherwise)
```

- If the first and last points fall in **different paragraphs**, the selection
  is refused with the cross-paragraph message.
- If the first point falls in **no paragraph** (a heading, a running header, a
  page number dropped by `MIN_CHARS`), nothing happens.
- If the selection is **collapsed** (a click, not a drag) and the target is not a
  highlight button, the click point is hit-tested the same way and the whole
  paragraph is selected.
- The hint for Decision 4: the hit line's `start`, plus the point's horizontal
  share of the line's width times the line's length. It is an approximate offset
  into the passage text, not an exact one.

The viewer reports `{ passageId, words, near }` through a new `onexcerpt` prop.
`PdfPage` itself stays a drawing component.

- *Alternative: match the words against every passage's text, without
  geometry.* The client does not have that text (Context), and a short
  selection like "the council" matches dozens of paragraphs.
- *Alternative: turn `TextLayer` span indices back into extractor items.* That
  needs a mapping from items to passage offsets stored at extraction time: a new
  column and an extractor version bump, to replace an approximate hint that
  Decision 4 only uses to pick among occurrences.

### 3. Resolving in two steps, across the navigation

The viewer knows the paragraph but may not have its text. So the page keeps a
**pending selection** `{passageId, words, near}` and navigates to
`?passage=<id>` through the existing `select` (`replaceState`, `noScroll`,
`keepFocus`). The load then renders that passage's page, as it already does
("shows the page of the selected passage, whatever page was asked for"), and
the excerpt is a `$derived` of the pending selection and the passage text.

The text view reports the same `{passageId, words, near}` shape. There `near` is
the length of the paragraph's rendered text before the selection start, not
counting the `¶n` link at its head. It is approximate, because markdown source
and rendered text differ.

The selected words stay in page state. Only `?passage=` goes into the URL, so a
selection never reaches a server log, the history or a shared link. So one path serves
both views, and `takeExcerpt` stops computing offsets itself.

### 4. `findExcerpt(text, words, near)` in `$lib/shared`

A pure function, unit-tested with no DOM:

1. Remove every whitespace character from `text`, keeping a map from each
   remaining character to its index in `text`.
2. Apply the **extractor's hyphen rule** to `words` (a letter, `-`, a line
   break, a lowercase letter joins without the hyphen), then remove its
   whitespace.
3. Find every occurrence. Choose the one whose start is closest to `near`.
4. Map back to `{start, end}` in `text`. Return `null` when there is no match.

The hyphen rule moves from `documents/extract.ts` into `$lib/shared` and the
extractor imports it, so the two cannot drift apart. `EXTRACTOR_VERSION` does not
change, because the extractor's behaviour doesn't.

When `findExcerpt` returns `null`, the card offers the paragraph whole (the
spec's "words the passage does not contain").

### 5. What the member sees

- `HandMapCard` shows `text.slice(start, end)`, the stored words, not the
  selection string.
- While the card is open, `PdfPage` draws the pending lines (the excerpt's lines
  through `linesFor`, or the whole paragraph's) with the same outline as a
  selected highlight. These are non-interactive and `aria-hidden`: the card is
  the accessible statement of what is selected.
- `reveal()` looks up the passage in `paragraphLines`, not only in `highlights`,
  so an already-visible paragraph stays where it is.
- The cross-paragraph message appears in the rail above the cards (and above the
  queue's card below 1024px, for the text view). It is `role="status"`, is
  cleared by the next selection, and comes from `messages/en.json`.

## Risks / Trade-offs

- **[Page weight on very long PDFs]** → About 500 KB at the 300-page ceiling,
  sent at every width. It is still a fraction of the PDF itself, which the
  original view downloads anyway. If a pilot shows it matters, the fallback is to
  drop `paragraphLines` from the load when the document exceeds a line budget and
  keep click-to-select for highlights only, with no API change.
- **[Browsers serialise `TextLayer` selections differently]** (spaces between
  spans, `<br>` as a line break or not) → The matcher ignores whitespace, so
  only the hyphen rule depends on line breaks. The e2e tests select across
  text-layer spans in the wide Playwright projects.
- **[The selection starts inside a highlight button]** → Buttons sit above the
  text layer, so a drag cannot start inside a claimed passage. The card is not
  offered for claimed passages anyway. A drag starting outside and crossing one
  hits two paragraphs and gets the message.
- **[Hit-test misses on unusual pages]** (rotation, crop boxes) → It is the exact
  inverse of the transform the highlights already use, which has rotated and
  cropped fixtures. A miss selects nothing, and the text view is one click away.
- **[Text normalisation drifts between extractor and viewer]** → Both use
  pdf.js defaults today, from the same pinned `pdfjs-dist`. A comment at both
  call sites ties them together. A test that only read the source would restate
  it, so the guard is the e2e selection tests, which fail if the two diverge on
  their fixtures.
- **[Markdown in passage text]** → The text view renders passage text through
  the markdown pipeline, and the matcher compares against the source. A selection
  spanning `*emphasis*` markup does not match and is offered whole, as today. PDF
  text rarely carries markdown syntax, and the original view compares raw PDF text
  with raw PDF text.
- **[The words come from a hostile file]** → They are only matched against the
  stored passage text, and the card shows the stored slice as plain text, never
  `{@html}`. The server validates the range again (`validExcerpt`).
- **[Approximate `near` picks the wrong one of two occurrences on the same
  line]** → Only when a short phrase repeats within one line, and the card shows
  the exact words it will store before anything is submitted.

## Migration Plan

No data migration. Shipping adds a field to the workspace data and new client
behaviour. Rolling back removes both, and existing evidence is untouched,
because excerpts recorded this way are ordinary excerpt ranges.

## Decided with the owner

- **Keyboard.** Selecting and clicking in the PDF is a pointer convenience. The
  text view (¶ links, keyboard text selection) is the keyboard route to the same
  card, which is the position `document-original-view` took for the canvas.
  Adding every paragraph as a tab stop in the PDF would put hundreds of stops
  ahead of the highlights.
- **Phones.** Out of scope. The original page is reached there only from the
  queue.
- **Words inside a claimed passage.** Not in this change. Neither view offers a
  second claim with its own excerpt on a passage that already has one.

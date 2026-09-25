## 1. One excerpt matcher, one hyphen rule

- [x] 1.1 Move the extractor's line-break hyphen rule (a letter, `-`, a line break, a lowercase letter joins without the hyphen) from `src/lib/server/documents/extract.ts` into `src/lib/shared/`, and have `groupParagraphs` import it; `EXTRACTOR_VERSION` unchanged
- [x] 1.2 `findExcerpt(text, words, near)` in `src/lib/shared/`: whitespace-insensitive, applies the hyphen rule to `words`, picks the occurrence whose start is closest to `near`, maps back to `{start, end}` in `text`, `null` when absent or empty
- [x] 1.3 Tests (unit): extraction fixtures still produce identical passages; `findExcerpt` covers extra and missing spaces, a line break inside the selection, a hyphenated word across a line, a phrase that appears twice (each `near` picks its own), a phrase repeated on one line, words not in the text, an empty selection; the hyphen join itself stays pinned by the extraction integration test. Both pdf.js text-content call sites (`extract-worker.js`, `PdfPage.svelte`) carry a comment that they must keep the same normalisation

## 2. Line boxes for every paragraph

- [x] 2.1 `workspaceView` returns `paragraphLines` (`passageId`, `page`, `lines` as `[x, y, w, h, start, end]` tuples rounded to 0.1) for every paragraph passage of a PDF, headings excluded, empty for other formats; `highlights` drops its own `lines` and the viewer looks them up by `passageId`; `lineBox()` in `geometry.ts` turns a tuple back into a `LineBox`
- [x] 2.2 Tests (integration, `workspace.test.ts`): an unidentified paragraph's lines are present and round-trip through `lineBox()` within 0.1 pt of the stored box; a heading's are not; a `.docx` has none; `paragraphLines` carries no text; a document in another community is still a 404 (unchanged `getDocument` path). The existing highlight e2e tests (`original-view.spec.ts`) pass unchanged

## 3. From a selection in the PDF to a pending selection

- [x] 3.1 `geometry.ts`: `inverse(transform)` and `hitLine(point, paragraphs)` (containment with `lineRect`'s padding, nearest within half a line otherwise), plus `nearOffset(line, point)`
- [x] 3.2 `PdfViewer`: when a selection settles (`pointerup`, or `selectionchange` quiet for 400 ms for touch), read it once; a selection already reported, or outside the scroller, is ignored. Hit-test its first and last client rects on their `[data-page]` element. A selection in one paragraph → `onexcerpt({passageId, words, near})`; in two paragraphs → `onselectionproblem()`; in no paragraph → nothing; a collapsed selection off any highlight button → `onselect(passageId)` for the clicked paragraph
- [x] 3.3 `reveal()` finds a passage through `paragraphLines`, so a paragraph already in view does not scroll
- [x] 3.4 Tests (unit, `pdf-geometry.test.ts`): `inverse` round-trips `lineRect` points on an unrotated, a 90°-rotated and a cropped transform at two zooms; `hitLine` picks the right paragraph and line, misses a margin point, and resolves a point between two lines to the nearer one

## 4. Both views, one resolution path

- [x] 4.1 `+page.svelte`: a pending selection `{passageId, words, near}` replaces the page's own offset computation. The excerpt is `$derived` from it and the selected paragraph's text through `findExcerpt`; a `null` result offers the paragraph whole
- [x] 4.2 `PaperView.selectWords` reports `{passageId, words, near}` (`near` = rendered text length before the selection start, excluding the `¶n` link) and reports a selection across two paragraphs as a problem instead of ignoring it; `MappingQueue` passes the same through
- [x] 4.3 `HandMapCard` shows `text.slice(start, end)`
- [x] 4.4 The cross-paragraph message (`workspace_select_one_paragraph` in `messages/en.json`) as `role="status"` above the rail's cards and above the queue's card, cleared by the next selection
- [x] 4.5 `PdfPage` draws the pending selection's lines (excerpt lines through `linesFor`, or the whole paragraph) with the selected outline, `aria-hidden`, while the hand-map card is open
- [x] 4.6 Tests (e2e, `original-view.spec.ts`, the `desktop` and `laptop` projects): dragging across a sentence of an unidentified paragraph offers the card with that sentence, and submitting it shows only that sentence's lines as confirmed; clicking an unidentified paragraph offers it whole without scrolling; selecting on page 3 while the URL names page 1 offers the page-3 paragraph; selecting across two paragraphs shows the message and no card; selecting in a heading offers nothing; a selection set programmatically with no pointer event (the touch path) resolves after it settles; the URL never carries the selected words
- [x] 4.7 Tests (e2e, text view): selecting the second occurrence of a repeated phrase submits the second occurrence's range; a selection across two paragraphs shows the message. The fixture is built inline in the spec with the exported `pdf()` (as `three-lines.pdf` is): a heading, a paragraph saying one phrase on its first and third lines, a paragraph with a word hyphenated across its line break, and one paragraph each on pages 2 and 3. No committed fixture is added or regenerated

## 5. Shipping

- [x] 5.1 `pnpm check`, `pnpm test`, `pnpm test:e2e`; the accessibility scan still passes on the document screen
- [x] 5.2 `package.json` minor bump, 0.6.1 → 0.7.0 (members can map from the PDF), stated in the commit or PR description

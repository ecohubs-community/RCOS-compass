## Why

In the original PDF view, a member can read a paragraph nobody has claimed and see
which words answer a clause, but cannot act on them there. The view only lets you
select paragraphs that already carry a highlight, and selected text is ignored.
Mapping by hand means switching to the text view, finding the same paragraph
again and selecting the same words a second time. PDF is the default view at
1024px and wider, so this detour is where most hand-mapping starts.

Without this change, a community maps less by hand than it reads, or maps whole
paragraphs where one sentence was meant. A whole-paragraph claim makes weaker
evidence: a reviewer checking a confirmed claim has to find the sentence that
answers the clause. The text view also has a bug that the same work fixes. When
the selected words appear twice in a paragraph, it stores the first occurrence,
which may not be the one the member selected.

Reasoning: `openspec/specs/document-viewer` ("Passages with claims are
highlighted…", "A member MUST be able to select any paragraph… to map it by
hand"), `openspec/changes/archive/2026-09-14-document-original-view/design.md`
(the text view as the accessible alternative), `docs/01-server-client-contract.md`
§2 (no new endpoint), `docs/03-data-model.md` (evidence excerpts),
`docs/02-component-guidelines.md` (no hover-only affordances).

## What Changes

- **Selecting words in the original PDF view offers the hand-map card with that
  excerpt**, exactly as selecting words in the text view does. The card shows the
  words that will be stored, taken from the passage text, not the browser's
  selection string.
- **Clicking a paragraph in the PDF without dragging selects it**, whether or not
  it is identified, so it can be mapped whole.
- **While the card is open, the PDF shows the excerpt's lines as selected**,
  because the browser's own selection highlight disappears as soon as focus moves
  to the clause picker.
- **Selecting a paragraph never scrolls the view away from it.** Today, selecting
  a paragraph that has no highlight scrolls the viewer to the top of its page.
- **One way to find an excerpt, for both views.** The selected words are matched
  to the stored passage text ignoring whitespace, with the extractor's own rule for
  words hyphenated across a line, and the occurrence is chosen by where the
  selection started. This fixes the text view's first-occurrence bug.
- **A selection across two paragraphs gets a plain message**: select within one
  paragraph, or click a paragraph to map it whole. Today it is silently ignored.
- The workspace view sends line positions for every PDF paragraph, not only the
  identified ones. It does not send the text of other pages.
- Unchanged: the `?/map` action, `mapPassage` and its excerpt validation, the
  evidence schema, permissions (`mapping.confirm`), and the extractor's output.
  No migration.

Not in this change, as decided: selecting in the PDF at phone widths, where the
original page is only reached from the queue; mapping words inside a passage that
already has a claim, which neither view offers; and a keyboard route inside the
PDF. Keyboard users map from the text view, which reaches the same card.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-viewer`: words selected, or a paragraph clicked, in the original PDF
  view can be mapped by hand. In both views, a selection resolves to the
  occurrence the member selected, and a selection across paragraphs is refused
  with a plain message.

## Impact

- `src/lib/server/services/workspace.ts`: paragraph line boxes for every PDF
  paragraph.
- `src/lib/shared/`: the excerpt matcher, and the hyphen-join rule moved out of
  `documents/extract.ts` so the extractor and the matcher use the same rule.
- `src/lib/components/documents/pdf/` (`geometry.ts`, `PdfViewer.svelte`,
  `PdfPage.svelte`), `PaperView.svelte`, `HandMapCard.svelte`, and the document
  route's `+page.svelte`.
- `messages/en.json`: the cross-paragraph message.
- Page data grows by about 30 bytes per PDF line, sent as compact tuples: roughly
  12 KB for a 10-page document and about 360 KB at the 300-page extraction
  ceiling. The stored JSON measures 78 bytes a line, so sending it as stored
  would more than double that.
- Version: minor (members can do something new).

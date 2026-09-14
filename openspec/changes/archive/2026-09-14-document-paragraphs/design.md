## Context

- `documents/extract.ts` reads PDFs with `unpdf.extractText({ mergePages: false })`
  and splits each page with `/\n\s*\n/`. pdf.js puts single newlines between
  lines and no blank lines, so each page becomes one passage. We checked
  `getTextContent()` on the same file: it returns one item per text run, with a
  transform (x, y, font size) and `hasEOL`.
- `passage.bbox` exists and is always null (P4 non-goal).
- `extract()` enforces its deadline with `withDeadline(Promise.race)`. The
  parsing runs on the main thread of the worker process.
- `playwright.config.ts` runs `node build/index.js`, so `BODY_SIZE_LIMIT` applies
  there. No `BODY_SIZE_LIMIT` is set anywhere, and the largest document fixture
  is 116 KB.
- `services/publishing.ts` lists `document` among publishable tables, and the
  publishing settings action casts `type` from the form without checking it.

This change is the foundation for `document-mapping-workspace` and
`document-original-view`. It changes no screen except the upload notice.

## Goals / Non-Goals

**Goals:**

- Paragraph and heading passages for PDF, Word, ODT and Markdown; plain text
  unchanged.
- Line positions for PDF passages, in a shape the browser viewer can use without
  re-parsing.
- A deadline that actually stops extraction.
- Uploads up to the configured ceiling work on the production server.
- Documents can't become world-visible by any path.
- Every existing document re-read once.

**Non-Goals:**

- OCR, table structure, reading order beyond one or two columns, footnote
  extraction as its own kind.
- Any use of positions (that's `document-original-view`).
- Keeping evidence attached across the re-read. No instance has real mappings, and
  the evidence spec already turns such evidence `stale`.

## Decisions

### Paragraphs from text-content geometry

The PDF reader switches to `getDocumentProxy` + `page.getTextContent()` from the
`unpdf` build.

Per page:

1. **Lines.** Non-empty items are grouped by baseline `y` (transform `f`) within
   30% of the item's font height (`hypot(a, b)`), then sorted by `x`. Adjacent
   items on a line are joined with a space when the horizontal gap exceeds ~0.2
   of the font height, and without one otherwise.
2. **Columns.** Line start `x` positions are clustered into bands. If exactly two
   bands exist, separated by a gutter wider than 5% of the page width, and each
   holds at least a third of the page's lines, the page is read left band then
   right band, each top to bottom. Otherwise the page is one column top to
   bottom. Full-width lines above both columns (a title) come first.
3. **Paragraphs.** Within a column, a new paragraph starts when:
   - the gap to the previous baseline exceeds 1.5× the column's median line gap;
   - the font height differs by more than 15%;
   - the line is indented by more than one font height relative to the column's
     left edge, after a line that ended more than 15% short of the column width.

   Lines join with a space. A line ending in `-` followed by a lowercase start
   joins without the hyphen.
4. **Kind.** A paragraph whose median font height is ≥ 1.2× the page's median
   body height and whose text is under 120 characters is a `heading`. Everything
   else is a `paragraph`. The existing ≥3-character floor still drops page
   numbers.
5. **Positions.** For each line in a passage:
   `{ x, y, w, h, start, end }`. `x`, `y`, `w`, `h` are the line's box in
   unrotated PDF user-space points, origin bottom-left, built from its items'
   transforms and widths. `start` and `end` are offsets into the final
   `passage.text`, so the first line starts at 0, the last ends at
   `text.length`, and ranges are contiguous apart from the joining space.

Thresholds are named constants in one place with a comment each, tuned against
the fixtures. **Why not a regex on the joined text:** the joined text has already
lost the vertical gap, which is the only evidence of a paragraph break, and the
positions are needed anyway. **Why not a layout library** (e.g. pdf2json,
pdfplumber): a new dependency, often native or Python, for a heuristic the
fixtures can pin down. `docs/04` §7 asks new dependencies to beat writing it.

### Headings in the other formats

- **Word:** `mammoth.convertToHtml` with its default style map. The HTML string
  is parsed by a small tokenizer into block elements only (`h1`–`h6`, `p`,
  `li`); tags are discarded and entities decoded. No DOM, no sanitizer, and
  nothing rendered — the output is passage text and kind, exactly as today.
- **ODT:** `text:h` elements become headings in the existing `content.xml` walk.
- **Markdown:** today `.md` goes through `fromPlainText`; this change wires it
  through `parseMarkdown` instead (new wiring, not a reuse of the extraction
  path). Heading nodes become headings; other blocks keep paragraph text.
- **Plain text:** unchanged.

Non-PDF passages keep `page = 1` and `bbox = null`.

### Extraction in a worker thread

`extract()` spawns a `worker_threads` Worker running `extract-worker`. It posts
`{ path, type }` and awaits one message: `{ ok: true, extraction }` or
`{ ok: false, reason }`.

- **At the deadline** the parent calls `worker.terminate()` and returns
  `ExtractionFailed` with the existing sentence. Termination stops a busy parse
  immediately, which `Promise.race` can't do.
- **`resourceLimits`** caps the worker's heap (default 512 MB, configurable), so a
  file that inflates in memory fails as "could not be read", not as an
  out-of-memory crash of the job worker.
- **One Worker per extraction.** The start-up cost is small next to parsing, and a
  reused worker would carry state from a hostile file into the next one.
- **Build — the mechanism actually shipped** (task 1.1's record): neither a
  `new URL(...)` entry nor an explicit SSR input survives all three
  environments — vitest resolves `.ts` sources a raw `Worker` cannot load, and
  the adapter-node build has no reliable address for a sibling chunk. So the
  worker is a **plain-JS file imported as a string** (Vite `?raw`) and run with
  `new Worker(code, { eval: true })`: the code travels inside the importing
  chunk, identical everywhere. Eval'd worker code is CommonJS; it resolves
  `unpdf`/`mammoth` via `createRequire(workerData.resolveFrom)`, where
  `resolveFrom` is the importing module's own `import.meta.url` — correct from
  the source tree and from `build/server/chunks` alike. Only *parsing* lives
  there (typed via a `@ts-nocheck` header and an eslint override); every
  heuristic stays in `extract.ts`. The worker also duplicates the zip
  central-directory walk rather than importing `zip.ts`, which is the price of
  staying a string.
- `withDeadline` stays as the parent-side timer and keeps its unit test. A new
  test drives a worker that never answers and asserts it was terminated.

### Verdicts, and what is not a verdict (from the code review)

- **Every verdict replaces the previous reading.** Once documents can be read
  twice, `failed` and `reference_only` must clear the old passages, search rows
  and live evidence exactly as success does — one `recordReading` transaction
  for all three, not only the success branch.
- **A reading that could not be attempted is not a verdict.** The worker sends
  the error's `code` with its message; `ENOENT`, `EACCES`, `MODULE_NOT_FOUND`
  and a crashed worker become `ExtractionUnavailable`. The job logs it, keeps an
  earlier reading as it was (status back to `extracted`, reader version
  untouched, so the next boot's sweep retries), and marks a first upload failed
  *without* a reader version and without the word "damaged".
- **Zip lengths are checked before allocation.** A `Buffer` is outside the
  worker's heap ceiling, so the entry's local header and compressed bytes must
  lie inside the file before anything is allocated from their declared sizes.
  The TS copy of the entry reader in `zip.ts` had no callers and is deleted.
- **Headings are not mapping candidates yet either.** `runMapping` sends only
  paragraphs, `mapPassage` refuses a heading, and the document screen offers no
  "Map to a clause" on one — ahead of `document-mapping-workspace`, so the
  re-read does not make headings mappable in the meantime.
- **Geometry fixes:** one-pass line grouping (items arrive top to bottom, so
  only the line being built can match — the old scan was quadratic on the main
  thread); fragments split at 1.5em, not 36pt, so narrow gutters are seen;
  columns additionally require the left band to end before the right begins and
  both to span half the text height (hanging indents and tables are not
  columns); body height is the character-weighted median (a page half headings
  keeps its headings); a superscript footnote marker joins its line.
- **Search deletes are batched.** `SearchIndex` gains `indexMany`/`removeMany`:
  FTS5 cannot index `subject_id`, so per-passage deletes were a full scan each,
  and paragraph-sized readings multiply passages 10–20×.
- **The re-read sweep skips suspended and deleted communities**, and runs in one
  transaction.

### The body limit follows the upload ceiling

- `BODY_SIZE_LIMIT` must be at least `MAX_UPLOAD_MB` plus 1 MB of form headroom.
  `document-mapping-workspace` keeps it there: its drop zone sends one file per
  request rather than raising the limit for every route.
- `config.ts` reads `BODY_SIZE_LIMIT` (adapter-node's own variable, bytes or a
  `K`/`M`/`G` suffix). In production, startup fails with a `ConfigError` when it
  is unset or below that floor, naming both values. Development through Vite
  ignores it.
- The Dockerfile sets `BODY_SIZE_LIMIT=26M` beside the default
  `MAX_UPLOAD_MB=25`, and the e2e `webServer.env` sets it the same way.

**Why not raise it globally to something large:** the body limit is a
protection for every route. Tying it to the one route that needs it keeps it
explainable. A future per-route limit is SvelteKit's to provide, not ours to
emulate.

### Documents are refused at the publishing service, not hidden in the UI

- `world` is only ever set by `services/publishing.ts` (`setPublished` →
  `applyOne`); `services/visibility.ts` moves things between `member` and
  `restricted` only. So the refusal lives in `setPublished`: 409 "Uploaded
  documents stay inside the community." for any `document` subject, before
  anything is written, so a batch containing one document publishes nothing.
- The publishing settings action validates `type` against the three publishable
  kinds and answers 400 otherwise.
- The migration sets any `world` document to `member` and writes nothing else.
  There are none today.
- `restricted` documents (the transparency exception) are reachable through the
  service only — no route offers them — and are out of scope here; the
  workspace change owns how its counts treat them.

### Re-reading existing documents

- `extractor_version` is `2` for this reader; existing rows are null.
- After migration, a one-off job (enqueued at startup if any document with
  status `extracted` or `reference_only` has `extractor_version` null or below 2)
  resets each such document to `uploaded` and enqueues its extraction.
  Extraction already replaces passages in one transaction and re-indexes search.
- **Bug fix on the way:** `extract-job.ts` today deletes passages without
  staling evidence — unreachable while extraction runs once per document, but a
  live defect the moment anything re-extracts. The job calls
  `staleEvidenceForDocument` inside its passage-replacing transaction, before
  the delete, so no evidence is ever left non-stale with a null passage.
- `failed` documents are also retried once, since the new reader may succeed
  where the old one failed.
- **Collateral, deliberate:** staling all evidence empties the dashboard's
  "You already have language for X of Y" line and the Path's "what you already
  have" ordering input until mappings are redone. Accepted because no instance
  holds real mappings; both surfaces recover as evidence is confirmed again.

## Risks / Trade-offs

- **[Heuristics split real bylaws badly: tables, footnotes, odd columns]** →
  Fixtures pin the cases we know. A bad split costs a member a paragraph boundary,
  not data, since the file is unchanged and downloadable. `extractor_version`
  lets a better reader re-read later without a migration.
- **[Headings misclassified]** → A false heading loses one mappable paragraph
  (short, large text) and a missed heading costs nothing today. The rule only
  starts to matter in `document-mapping-workspace`, which gives headings to the
  model as context.
- **[Worker entry not emitted by the SvelteKit build]** → Proven first (task
  1.1), with a fallback entry.
- **[Heap limit too low for a legitimate 400-page PDF]** → The existing
  `four-hundred-pages.pdf` fixture must pass under the default limit, and the
  limit is configurable.
- **[BODY_SIZE_LIMIT misconfigured on an existing deployment]** → Startup
  refuses with a sentence naming both values, which is louder than silent 413s.
- **[Re-reading a large backlog at once]** → The extraction queue already runs
  one job at a time. The one-off job only enqueues.

## Migration Plan

1. Deploy the migration: add `passage.kind` (default `paragraph`) and
   `document.extractor_version`, and set `world` documents to `member`.
2. Set `BODY_SIZE_LIMIT` before starting the new build; startup says so if not.
3. On startup the one-off re-read enqueues extraction for every document below
   reader version 2.
4. Rollback: the previous build ignores the new columns and keeps the new,
   better passages; `BODY_SIZE_LIMIT` is harmless to it.

## Open Questions

_None._ The owner confirmed no instance holds real mappings, so re-reading
everything automatically is acceptable.

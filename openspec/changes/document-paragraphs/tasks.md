## 1. Extraction in a worker thread

- [x] 1.1 Prove the SvelteKit server build emits a `worker_threads` entry referenced by `new URL('./extract-worker.js', import.meta.url)`; if not, add it as an explicit SSR build input, and record which in `design.md`
- [x] 1.2 Add `documents/extract-worker.ts` running the existing extractors and posting `{ ok, extraction | reason }`; make `extract()` spawn one Worker per call with `resourceLimits`, terminate it at the deadline, and map a worker error or exit to `ExtractionFailed`
- [x] 1.3 Add `EXTRACT_MAX_HEAP_MB` (default 512) to `config.ts`
- [x] 1.4 Tests: a worker whose parser never yields is terminated at the deadline and the document is `failed` with the deadline sentence; a heap-exhausting input fails with a readable reason while the job worker keeps running; `four-hundred-pages.pdf` still extracts to its ceiling under the default heap; the existing hostile fixtures land in the same states

## 2. Schema

- [x] 2.1 Add `passage.kind` (`heading` | `paragraph`, default `paragraph`) and `document.extractor_version`; document the `bbox` JSON shape on the column
- [x] 2.2 Generate the migration, including setting any `world` document to `member`
- [x] 2.3 Tests: migration on a fixture with a `world` document leaves it `member` and every passage `paragraph`

## 3. PDF paragraphs and positions

- [x] 3.1 Rewrite `fromPdf` on `getDocumentProxy` + `getTextContent`: lines by baseline, two-column detection, paragraph breaks by gap / font height / indent, hyphen joining, heading classification, line boxes with character ranges; thresholds as named constants
- [x] 3.2 Keep the page ceiling, scan (`reference_only`) detection and the encrypted sentence unchanged
- [x] 3.3 Write `kind`, `bbox` and `extractor_version = 2` in `extract-job.ts`
- [x] 3.4 Fixtures: `multi-paragraph-no-blank-lines.pdf` (manifesto-like), `two-columns.pdf`, `headings-and-table.pdf`, `rotated-page.pdf`
- [x] 3.5 Tests: passage counts, order and kinds per fixture; each PDF passage's line ranges start at 0, end at its length and are contiguous; the two-column fixture reads left column first; a hyphenated word is joined; the rotated page's boxes are in unrotated user space

## 4. Headings in Word, ODT and Markdown

- [x] 4.1 Word: `mammoth.convertToHtml` → block tokenizer (`h1`–`h6`, `p`, `li`) → passages with kind; no HTML stored
- [x] 4.2 ODT: `text:h` → heading in the existing walk
- [x] 4.3 Markdown: heading nodes from `parseMarkdown` → heading passages
- [x] 4.4 Fixtures and tests: a `.docx` with heading styles, an `.odt` with `text:h`, a Markdown file with headings each produce the expected kinds; a `.docx` whose text contains `<script>` stores it as words

## 5. Re-reading existing documents

- [x] 5.1 On startup, enqueue a one-off job when any `extracted`, `reference_only` or `failed` document has `extractor_version` null or below the current version
- [x] 5.2 Fix `extract-job.ts` to call `staleEvidenceForDocument` inside its passage-replacing transaction, before deleting passages — today a re-extraction would leave non-stale evidence with a null passage
- [x] 5.3 The job resets each such document to `uploaded` and enqueues its extraction; `failed` documents are retried once
- [x] 5.4 Tests: an old document is re-read with current passages and version; its evidence becomes `stale` (none left non-stale with a null passage) and remains readable; a current document is not re-read; a second startup enqueues nothing new; the dashboard coverage count drops to zero after the re-read rather than erroring

## 6. Body size limit

- [x] 6.1 Read `BODY_SIZE_LIMIT` in `config.ts`; in production refuse to start when unset or below `MAX_UPLOAD_MB` + 1 MB, naming both
- [x] 6.2 Set `BODY_SIZE_LIMIT=26M` in the `Dockerfile` and in `playwright.config.ts` `webServer.env`; document it in the configuration docs
- [x] 6.3 Add a generated 5 MB valid PDF fixture (produced by a script, not committed as a blob, if the repo prefers)
- [x] 6.4 Tests: config unit tests for unset / too low / sufficient; e2e uploads the 5 MB PDF and sees it listed

## 7. Documents stay inside the community

- [x] 7.1 `setPublished` (`services/publishing.ts`, where `world` is set) refuses any `document` subject with 409 before writing anything
- [x] 7.2 Validate `type` in the publishing settings action against definition / decision / artifact; 400 otherwise
- [x] 7.3 Change the upload notice to "Every member of {community} will be able to read these files. Nothing is published outside the community." — through a paraglide message, since `pnpm lint` ratchets untranslated strings
- [x] 7.4 Remove `document` from the publishing settings screen's subject lists if it appears there
- [x] 7.5 Tests: publishing a document by service and by crafted POST is refused and changes nothing; a batch of two definitions and a document publishes nothing; setting a document `world` is refused; anonymous requests for a document's file and passages still answer as not found; `tests/e2e/documents.spec.ts` asserts the new notice

## 8. Documentation

- [x] 8.1 `docs/03-data-model.md`: `passage.kind`, the `bbox` shape, `document.extractor_version`
- [x] 8.2 `docs/00-architecture.md` §8 and `docs/04-security.md` §5.2: extraction in a terminated worker with a heap ceiling; documents never world-visible
- [x] 8.3 Deployment docs: `BODY_SIZE_LIMIT` and why it follows `MAX_UPLOAD_MB`

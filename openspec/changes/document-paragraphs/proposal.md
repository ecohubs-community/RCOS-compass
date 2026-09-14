## Why

Every PDF a community uploads becomes **one passage per page**. `unpdf` joins a
page's lines with single newlines and emits no blank lines, and `paragraphsOf`
only splits on blank lines. A community that uploads its bylaws gets page-sized
"passages": nobody can map paragraph 4.2 to §3.6.2 because 4.2 isn't a row, and
every AI suggestion quotes a whole page. We checked this against a real upload,
`EcoHubs_Manifesto.pdf`: one page, 2,340 characters, one passage.

Two more defects sit under the same screen:

- **Uploads above 512 KB very likely fail in production.** `adapter-node` rejects
  request bodies over `BODY_SIZE_LIMIT`, which defaults to 512 KB and is set
  nowhere — not in the Dockerfile, `.env` or docs. `MAX_UPLOAD_MB` (25) is never
  reached. The e2e suite does run the built server, but every document fixture
  is under 120 KB, so it can't see this.
- **The extraction deadline can't stop a PDF that keeps the parser busy.** It is
  a `Promise.race` in the same process. Busy parsing blocks the event loop, so
  the timer can't fire until the work yields, and a hostile file holds the
  worker for as long as it likes.

And one promise the upload screen implies is not enforced: nothing in the
publishing service stops a crafted request from making an uploaded document
world-visible.

What a community loses without this: the mapping flow is unusable on the most
common file type, and a real set of bylaws (a few MB) probably can't even be
uploaded to a production instance.

This is the first of three changes. The other two are
`document-mapping-workspace` (scan, library, workspace, versions) and
`document-original-view` (the PDF as uploaded). This one ships value on its own
and gives the other two the paragraphs and positions they need.

Reasoning: `docs/00-architecture.md` §8 (document toolchain),
`docs/04-security.md` §5.2 (untrusted documents) and §7,
`docs/03-data-model.md` (passage), `docs/13-data-inventory.md`,
`UI Spec — v0.1 (draft).md` §4.5, and the archived P4 design
(`archive/2026-09-04-documents-evidence-ai/design.md`, which left `bbox` null).

## What Changes

- **PDF passages are paragraphs.** The PDF reader uses pdf.js text content
  (already inside `unpdf`, so no new server dependency). It groups items into
  lines, lines into paragraphs by vertical gap, font size and indentation, reads
  two-column pages column by column, and joins hyphenated line ends.
- **Headings are recognised in every format.** A PDF heading is found by font
  size, Word by heading styles, ODT by `text:h`, Markdown by heading nodes. A
  passage has a `kind`, either `heading` or `paragraph`.
- **A PDF passage records where it is.** `bbox` holds one box per line in PDF
  user space, plus the character range of the passage text that line carries.
  Nothing reads it yet; `document-original-view` draws highlights from it.
- **The reader version is recorded** (`extractor_version`). Every document read by
  the old reader is re-read once, automatically, after deploy. Evidence on
  replaced passages goes `stale`, as the evidence spec already requires; no
  instance holds real mappings yet.
- **Extraction runs in a worker thread that is terminated at the deadline**, so
  the deadline means what it says for a file that never finishes parsing.
- **The size ceiling is the only size limit a member meets.** `BODY_SIZE_LIMIT`
  is derived from `MAX_UPLOAD_MB` with headroom for the form and set in the
  Dockerfile and the e2e server. Startup refuses a configuration where the body
  limit is below the upload ceiling. The e2e suite, which already runs
  `node build/index.js`, uploads a multi-megabyte fixture.
- **Uploaded documents never leave the community, for now.** **BREAKING** to the
  `documents` spec: the publishing service refuses a document subject, visibility
  can't be set to `world` for a document, and the publishing settings action stops
  accepting `type=document`. No screen offered it.
- **The upload notice reads** "Every member of <community> will be able to read
  these files. Nothing is published outside the community."

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `documents`:
  - passages are paragraphs and headings; PDF passages carry line positions;
    the reader version is recorded, and documents read by an older reader are
    re-read;
  - extraction is terminated at its deadline;
  - the upload size limit a member meets is the configured ceiling;
  - documents can't be published or made `world`;
  - the upload notice wording changes.

## Impact

- **Schema:** one migration adding `passage.kind` (default `paragraph`) and
  `document.extractor_version`, defining the `bbox` JSON shape, and setting any
  `world` document to `member`.
- **Server:**
  - `documents/extract.ts`: the PDF reader is rewritten, and the Word, ODT and
    Markdown readers gain headings.
  - A new `documents/extract-worker.ts` (a `worker_threads` entry).
  - `documents/extract-job.ts`: writes `kind`, `bbox` and the reader version.
  - A new re-read job.
  - `services/publishing.ts`, `services/visibility.ts`, and the publishing
    settings route.
  - `config.ts`: validates the body limit against the upload ceiling.
- **Deployment:** `Dockerfile` sets `BODY_SIZE_LIMIT`; the configuration docs say
  why.
- **Routes:** only the upload notice text on `c/[slug]/documents`.
- **Tests:**
  - extraction fixtures for a PDF with no blank lines (like the manifesto), two
    columns, headings with a table, and a rotated page; `.docx` headings, `.odt`
    `text:h`, Markdown headings;
  - a parser-hang fixture proving the worker is terminated;
  - the existing hostile fixtures unchanged in outcome;
  - re-read job tests;
  - publishing refusal by service and by crafted POST;
  - a 5 MB PDF upload in the e2e suite (adapter-node build);
  - an updated notice assertion in `tests/e2e/documents.spec.ts`.
- **Out of scope:** OCR, table structure, footnote detection beyond not merging
  footnotes into body paragraphs, and anything a member sees besides the notice
  and better passages.

## Why

Once `document-paragraphs` lands, a community's documents are divided into real
paragraphs, but the screens still can't make the product's biggest promise:
"you already have language for 38 of 187 requirements".

- **The library** is a filename list with an extraction status. It doesn't say
  which documents still need attention, how far each one is, or what the
  community already has.
- **The document screen** is a column of passage cards. Mapping by hand means
  typing a clause number into a free-text field. AI suggestions arrive as a
  clause chip with no explanation, from a run that holds the request open for the
  whole document.
- **A file can't be updated.** New bylaws mean deleting the old document and
  losing every claim made about it.

Designs 09 (library & upload), 05 (documents & mapping) and 16b (mobile mapping
queue) describe the answer. What a community loses without this: it uploads its
bylaws, sees a wall of text, and can't tell whether it is further along than it
thought, which is the moment that decides whether an existing community stays.

Second of three changes. It depends on `document-paragraphs` (paragraphs,
headings, reader version) and is followed by `document-original-view` (the PDF as
uploaded, with thumbnails). Everything here uses the Text view, so this change is
complete without the third.

Reasoning: `UI Spec — v0.1 (draft).md` §4.5 and §6.1, `docs/01-server-client-contract.md`
(loads, actions, no new endpoints), `docs/02-component-guidelines.md` (component
tiers, mobile), `docs/03-data-model.md` (document, passage, evidence),
`docs/04-security.md` §1 (permission matrix) and §5.3 (AI budgets),
`docs/13-data-inventory.md`, `design_files/platform/RCOS Compass.dc.html` screens
05, 09, 16b, and the discussion rail change for the shell's full-height mode.

## What Changes

- **Scanning is a job a member starts.**
  - Upload never sends text to a model. "Start RCOS mapping" shows how many
    paragraphs Compass will read, then claims the document atomically and
    enqueues a scan charged to that member.
  - The job reads paragraph passages in batches, records each passage as read in
    the same transaction as its suggestions, and checks on every batch that the
    document's content hasn't changed since the scan began.
  - A budget or provider stop keeps what was produced and can be continued. An
    unexpected failure or a silent worker ends as "stopped" with a reason, never
    as "scanning" forever.
  - The member who started it gets an in-app notification when it ends.
  - Where a scan isn't possible, the control is disabled with a sentence saying
    why.
- **Suggestions explain themselves.** The mapping task returns a one-sentence
  reason and, optionally, the exact excerpt it relies on. The reason is shown as
  plain text instead of a strength. Confidence is still recorded, never shown.
  Headings are given to the model as context, never as candidates.
- **New evidence acts:**
  - *Change clause* dismisses the suggestion and confirms the chosen clause in
    one step.
  - *Not governance* dismisses every open suggestion on a passage.
  - Hand mapping can carry the selected excerpt.
  - Stale claims whose paragraph reappears unchanged after a replacement can be
    re-confirmed. This merges into any existing row for that paragraph and
    clause.
- **A document has a mapping state**, derived from its data:
  - *Reading*, *Couldn't be read*, *Can't be scanned*, *Scanning*, *Not scanned*,
    *Not governance*, *Mapping in progress*, *Mapped*.
  - *Mapped* needs at least one mapping (manual or AI), nothing open, and either a
    complete scan or a member's **Mark mapping as done**.
  - Mapping by hand counts as progress.
- **Files have versions.**
  - Any member who can upload can **replace** a document's file. The previous
    file is kept as a version with who uploaded it and when.
  - Any such member can **restore** an earlier version, which is itself a
    replacement.
  - Versions count toward the storage ceiling. Only a steward can delete a
    version or remove the document with all its versions.
  - Claims on replaced paragraphs go stale and are offered for re-confirmation
    where the text reappears.
- **The library (design 09).**
  - Header and **Upload documents**; a drop zone for up to 10 files, each with
    its own outcome.
  - The coverage line; All / Not mapped / Mapped filters in the URL.
  - One row per document: type badge, meta, uploader, state chip, "N of M
    passages mapped · K became definitions", a primary action for the state, and
    a ⋯ menu (Start RCOS mapping, Open, Replace with a newer file, Previous
    versions, Remove from library).
- **The workspace (design 05), 1024px and wider.**
  - Two panes. The document pane is the typeset **Text view**: page sheets with
    page navigation for PDFs, one sheet with a heading outline for other formats.
  - The rail shows counts and coverage, the scan control, progress or reason, and
    one card per identified passage: quote → §ref, clause name, reason, a
    requirement tip, and Confirm / Change clause / Dismiss / Not governance.
    Confirmed cards show who and when, plus "Turn into definition".
  - A pane footer offers "Jump to next unmapped passage".
- **Below 1024px, the queue (design 16b).** One open passage at a time in two
  steps (read it, confirm the ref), with "see it in the page". This covers tablets
  too, following the discussion rail's `lg` breakpoint.
- **Shared form-action helper.** The `run()` wrapper duplicated in the discussion
  and document routes moves to one shared server module.
- **`notify` gains an explicit way to tell the member a job ran for.** This also
  fixes `export.ready`: the export job notifies the member who asked, and `notify`
  drops that same member as "the author", so the notification is never written.
  Untested today. No screen lists notifications yet, so the rows join the
  existing TopBar unread count; a notifications page stays out of scope.
- **A definition keeps naming its source.** `definitionOrigin` joins through the
  passage, which every replace, restore and re-read nulls — the "from
  bylaws-2019.pdf, page 4" line on a definition would silently vanish. It is
  rewired through the evidence's document reference and falls back to the quote
  when the passage is gone.
- **Two latent defects fixed on the way:** upload limit checks move inside the
  writing transaction (two concurrent uploads can currently pass the storage
  ceiling together), and the hourly upload allowance rises so one multi-file
  drop doesn't spend it whole.

## Capabilities

### New Capabilities

- `document-scan`: who may start a scan, what it costs and how that is shown, the
  atomic claim, batches and read markers, content-change and stall handling,
  stopping, continuing, and the end-of-scan notification.
- `document-library`: the mapping state and its derivation, marking mapping done,
  progress and coverage, filters, row actions, and multi-file upload.
- `document-viewer`: the Text view, highlights and excerpts, passage selection
  shared with the rail, and page and outline navigation. `document-original-view`
  adds the original PDF to this capability.
- `mapping-workspace`: the two-pane screen, cards, requirement tip, clause
  picker, card acts, next open passage, and the queue below 1024px.

### Modified Capabilities

- `documents`: a document's file can be replaced by any member who can upload;
  earlier files are kept as versions, downloadable, restorable, deletable by a
  steward, counted toward the storage ceiling, and removed with the document.
- `evidence`: reason and excerpt; change clause; not governance on a passage;
  re-confirmation after replacement, merging with an existing pairing.
- `ai-assistance`: the mapping task's reason and excerpt, with headings as
  context only.
- `notifications`: a member is told when a job they started finishes, even
  though their own act started it.

## Impact

- **Schema (one migration):**
  - `passage.scanned_at`.
  - `document`: `scan_status`, `scan_detail`, `scan_actor`, `scan_heartbeat_at`,
    `content_generation`, `mapping_done_at`, `mapping_done_by`.
  - `evidence`: `reason`, `excerpt_start`, `excerpt_end`, `document_id` (kept
    when the passage goes, so stale claims still know their document).
  - New `document_file_version` table.
  - User references set null on erasure; `docs/13-data-inventory.md` entries for
    the new personal columns.
- **Server:**
  - `services/mapping.ts`: claim, availability, estimate, batch loop.
  - New `jobs/scan-job.ts`.
  - `services/evidence.ts`: new acts.
  - `services/documents.ts`: replace, restore, versions, library view model,
    multi-upload.
  - A pure `mappingStateOf` module.
  - `ai/prompts/map-document.ts` and `ai/tasks/map-document.ts` (prompt v2); the
    fixture provider.
  - `services/notifications.ts`; `jobs/export-job.ts`.
  - The new shared form-action module.
- **Routes:**
  - `c/[slug]/documents` and `c/[slug]/documents/[id]` are rewritten.
  - New `…/documents/[id]/versions/[versionId]/file` (member-only, attachment,
    same guards as the current file route).
  - `BODY_SIZE_LIMIT` stays one file's ceiling plus headroom. With JavaScript,
    the drop zone sends each file as its own request. Without it, one form
    submission carries all chosen files and the limit applies to their total,
    which the upload control states.
- **Components:** `DocumentRow`, `UploadDropZone`, `VersionList`, `PaperView`,
  `SuggestionCard`, `RequirementTip` (a new component — `HelpTip` renders only
  static registry entries), `ClausePicker`, `MappingQueue`, each in the gallery.
  The standard page gains per-clause anchors for "Open in Standard"; the TopBar
  gains an optional sub-crumb. All new strings go through paraglide messages —
  the i18n ratchet in `pnpm lint` fails on new untranslated literals.
- **Tests:**
  - A unit table for `mappingStateOf`.
  - Integration tests for scan claim, stall, content-change race, budget stop and
    continue, notifications (scan and export), evidence acts, replace, restore and
    versions, cross-tenant registry entries for every new service, and erasure of
    the new user references.
  - e2e for library → scan (fixture provider) → card acts → Mapped → definition;
    the same by hand with `AI_PROVIDER=null`; replace and restore; the queue at
    375 and 768; and no-JavaScript runs.
  - Updated `tests/e2e/documents.spec.ts`; the a11y scan at 375 / 768 / 1024 /
    1440.
- **Out of scope:** the original PDF rendering and thumbnails
  (`document-original-view`), OCR, editing documents, and publishing them.

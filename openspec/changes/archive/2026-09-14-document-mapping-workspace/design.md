## Context

After `document-paragraphs`, passages are paragraphs and headings with a reader
version, and PDF passages carry line boxes. The rest is as P4 left it:

- **Mapping run.** `services/mapping.ts#runMapping` is awaited inside a form
  action. It skips passages that already have *evidence*, so a passage the model
  had nothing to say about is sent again on every run. It writes `suggested` rows
  with `onConflictDoNothing` on `(community, passage, clause)`.
- **Job queue.** `jobs/queue.ts#enqueueOnce` deduplicates by job **kind** only.
  Used for a per-document scan, one community's scan would block every other
  scan on the instance.
- **Existing evidence acts.** `evidence.ts` has `mapPassage` (resolves a clause
  ref), `confirmEvidence`, `dismissEvidence`, `turnIntoDefinition`,
  `staleEvidenceForDocument` and `languageCoverage`.
- **Notifications.** `notifications.ts#notify` removes `ctx.membership` from the
  recipients. `export-job.ts` builds a `Ctx` for the member who asked and
  notifies that same member, so `export.ready` is never written. Nothing tests
  it. And there is **no notifications surface**: no screen lists notification
  rows; the only rendering is the unread count on the Discussions nav in
  `TopBar.svelte`.
- **Names.** Uploader names come from `services/person.ts` (`personLabel`,
  `initialsOf`), and every module that prints a person's name must be listed in
  `tests/support/person-surfaces.ts` or that suite fails. Erasure never deletes
  a user row — it tombstones it (name and email blanked) — so `on delete set
  null` FKs never fire and no per-column erasure code is needed; rendering
  through `personLabel` is what makes an erased member read correctly.
- **i18n.** `pnpm lint` runs `scripts/check-i18n.mjs`, a ratchet over
  untranslated strings per route. Rewriting the document screens with new
  English literals fails lint unless the strings go through paraglide messages.
- **Form-action helper.** A `run(step, act)` wrapper exists twice: in the
  discussion route and in the document route.
- **Shell.** It already has a full-height mode (`page.data.fullHeight`), added
  for the discussion rail, which stacks below `lg`.
- **Storage.** One file per document. `uploadRefusal` sums `document.bytes` for
  the storage ceiling. There is no version history.

Decisions made with the owner in exploration:

- Scanning is started by a member.
- "Mapped" needs at least one mapping, nothing open, and a complete scan or an
  explicit "done".
- Manual mapping counts as progress.
- Any member can replace a file, and earlier files are kept.
- Reasons are shown instead of strengths.
- Below 1024px the phone queue is used.
- "Not governance" is offered only on passages with open suggestions.
- "Turn into definition" keeps pre-filling the whole passage.

## Goals / Non-Goals

**Goals:**

- The scan as a visible, resumable, race-safe job that can't stay "scanning"
  forever.
- One pure definition of a document's mapping state, shared by library and
  workspace.
- Screens 09, 05 and 16b built on the Text view, working without JavaScript and
  at 375px.
- Replacing and restoring files without losing files or the record of claims.

**Non-Goals:**

- Rendering the original PDF, page thumbnails and line-precise highlights in it
  (`document-original-view`).
- Streaming progress: the screen reloads its data while a scan runs.
- Diffing versions, or carrying claims across a replacement automatically.
- Marking unidentified paragraphs as not governance.
- Pre-filling a definition from just the excerpt.

## Decisions

### A scan claims its document atomically, and carries a content generation

`startScan(ctx, documentId)`:

1. Requires `ai.run`, a writable community, an `extracted` document, an adopted
   standard, and `aiAvailability` ok. Each refusal is a sentence (see
   availability below).
2. **Claims** with one conditional update:
   `UPDATE document SET scan_status='queued', scan_actor=?, scan_detail=NULL, scan_heartbeat_at=now, mapping_done_at=NULL, mapping_done_by=NULL WHERE id=? AND community_id=? AND (scan_status NOT IN ('queued','running') OR scan_heartbeat_at < now - STALL)`.
   Zero rows changed means a scan is already live, and the call returns without
   enqueueing.
3. Enqueues a `document.scan` job with
   `{ communityId, documentId, actorId, generation: content_generation }`.

**Why not `enqueueOnce`:** it deduplicates by kind, not subject. **Why not add a
subject key to the queue:** the document row is where the member-visible state
lives, and a claim there is one statement with no second table to keep
consistent.

`content_generation` is incremented by every act that replaces passages:
extraction, replace, restore, re-read.

### The scan job never writes into content that changed under it

`jobs/scan-job.ts`:

1. **Setup.** Rebuild `Ctx` from `actorId` as `export-job` does. If the
   membership has ended or `ai.run` is gone, stop with "The member who started
   this scan can no longer run it. Anyone who can may continue it." Set
   `running`.
2. **Loop.** Take up to 12 `paragraph` passages with `scanned_at IS NULL` in
   `(page, ordinal)` order within the page ceiling. Each passage carries its
   nearest preceding heading as `under`.
3. **Each batch:**
   - re-check `aiAvailability`, since the community may have switched AI off
     mid-scan;
   - call `suggestMappings`;
   - in **one transaction**, confirm
     `content_generation = payload.generation AND scan_status = 'running'`, and
     if not, write nothing and end quietly (a replace, restore, delete or new
     claim superseded this scan);
   - otherwise insert suggestions (`onConflictDoNothing`), set `scanned_at` on
     every passage in the batch, and set `scan_heartbeat_at = now`.
4. **Stop:** a refused budget, failed provider or unavailable AI →
   `scan_status = 'stopped'` with that sentence, and the scan-ended notification.
5. **End:** no unread paragraph within the ceiling → `complete`, and the
   scan-ended notification.
6. **Unexpected error:** the whole handler is wrapped. Any throw records
   `stopped` with "The scan stopped unexpectedly. What it found is kept; you can
   continue it." and completes the job. Retrying a scan through the queue would
   re-charge and could duplicate notifications.
7. **Unparseable output:** the batch counts as read (its passages get
   `scanned_at`) and discarded. That follows `ai-assistance`: discarded, not
   retried into shape.

**Stall.** A `queued` or `running` document whose `scan_heartbeat_at` is older
than `STALL` (10 minutes; one batch is well under a minute) is treated as
*stopped* by `mappingStateOf` and can be claimed again. This covers a killed
worker process, where no code runs to record the stop.

**Why `scanned_at` rather than "has evidence":** most passages answer nothing,
and the current rule pays again for every "no".

### Availability and estimate are one function

`scanAvailability(ctx, document)` returns either
`{ ok: true, paragraphs: n, alreadyRead: m }` or `{ ok: false, reason }`.

| Situation | Reason shown |
|---|---|
| `reference_only` | "This file carries no readable text — it looks like a scan. Compass can keep it, but can't read it." |
| `uploaded` / `extracting` | "Compass is still reading this document." |
| `failed` | the document's `status_detail` |
| No adopted standard | "Adopt a standard first; there is nothing to map it against yet." |
| AI unavailable | `aiAvailability`'s own sentence (off for the community, budget spent, no provider) |
| No `ai.run` | No control is shown at all, rather than a disabled one |

The enabled button reads "Start RCOS mapping", with the description "Compass will
read 42 paragraphs". A stopped scan reads "Continue scan · 30 paragraphs left".

### The mapping state is a pure function of counts

`services/mapping-state.ts` exports
`mappingStateOf(input): { state, primaryAction }`. Its input is
`{ status, scanStatus, scanStalled, identified, open, doneAt }`. It has no
database access, and unit tests enumerate every row of this table:

| # | Condition (first match wins) | State |
|---|---|---|
| 1 | `status` ∈ uploaded, extracting | Reading |
| 2 | `status` = failed | Couldn't be read |
| 3 | `status` = reference_only | Can't be scanned |
| 4 | `scanStatus` ∈ queued, running and not stalled | Scanning |
| 5 | `identified = 0` and `scanStatus` = none | Not scanned |
| 6 | `identified = 0` and `scanStatus` = complete | Not governance |
| 7 | `identified ≥ 1`, `open = 0`, and (`scanStatus` = complete or `doneAt` set) | Mapped |
| 8 | otherwise | Mapping in progress |

Definitions:

- `identified` counts **paragraph** passages with at least one non-stale evidence
  row, whether suggested by AI or by a human.
- `open` counts identified passages with at least one `suggested` row.

Consequences, each a test:

- One hand mapping on an unscanned document → *Mapping in progress* (row 8),
  until "Mark mapping as done".
- A stopped or stalled scan with nothing identified → *Mapping in progress*.
- A new scan clears `doneAt` (in the claim), so a document marked done that is
  scanned again must be finished again.
- Replace and restore clear `doneAt` and reset the scan.

`libraryCounts(ctx)` computes `identified`, `open`, `becameDefinitions`
(distinct `definition_source` rows through the document's evidence) and
`governancePages` for all documents in one grouped query. `documentCounts` does
the same for one document. Both feed `mappingStateOf`, and both apply the
`visibleTo` helper inside the query, so a `restricted` document (the
transparency exception — service-only today, no route sets it) never appears in
a list or a count shown to a member who may not see it. `languageCoverage`
stays community-wide: it is a count of clauses, not content, and evidence
confirmed from a later-restricted document still exists. Recorded as
deliberate.

**Mark mapping as done** (`markMappingDone`, `mapping.confirm`) is offered when
`identified ≥ 1`, `open = 0`, and the scan is not live. It sets `mapping_done_at`
and `mapping_done_by`. **Reopen mapping** clears them.

Library filters (`?filter=`):

- **Not mapped** is state 5.
- **Mapped** is states 7 and 8, following the design's counts.
- **All** is everything.

### Evidence acts

All are in `services/evidence.ts`, require `mapping.confirm` and a writable
community, and are registered in the tenant registry.

- **`changeClause(ctx, evidenceId, clauseRef)`.** One transaction:
  1. The suggestion becomes `dismissed`.
  2. For `(passage, chosen clause)`, an existing row becomes `confirmed` by this
     member, whatever its state; otherwise a `confirmed`, `human` row is inserted
     carrying the suggestion's excerpt.
  3. The clause is resolved through the existing (private, to-be-exported)
     `resolveClause`, which accepts **any** clause of the adopted standard by
     key or ref. The picker *suggests* only answerable clauses (countable, with
     an owner section), but a typed ref outside that list still resolves —
     deliberate: evidence about a SHOULD/MAY clause is a legitimate claim.
     "Turn into definition" is only offered on evidence whose clause has an
     owner section, because `turnIntoDefinition` answers 409 otherwise.
- **`dismissPassage(ctx, passageId)`.** Every `suggested` row on the passage
  becomes `dismissed`. `confirmed` rows are untouched. The screen only offers it
  on passages with an open suggestion.
- **`mapPassage`** gains an optional `{ excerptStart, excerptEnd }`, validated as
  `0 ≤ start < end ≤ text.length`.
- **`reconfirmCandidates(ctx, documentId)`.** Stale evidence whose most recent
  document is this one and whose `sha256(quote)` equals a current passage's
  `text_hash`.
- **`reconfirm(ctx, evidenceId, passageId)`.** If a row already exists for
  `(passageId, clause)`, that row becomes `confirmed` by this member and the stale
  row stays stale, pointing nowhere. Otherwise the stale row is repointed and
  confirmed. This avoids the unique `(community, passage, clause)` violation a
  plain repoint would hit after a new scan.

Stale evidence has `passage_id = null`, so "whose most recent document" needs a
`document_id` on evidence. It is added and backfilled from the passage, and kept
when the passage goes.

**Definition provenance survives.** `definitionOrigin` (the "from
bylaws-2019.pdf, page 4" line on a definition) inner-joins `passage` through
`definition_source.passage_id`, which nulls on every replace, restore and
re-read — the line silently vanishes. It is rewired through
`definition_source.evidence_id` → `evidence.document_id`, falling back to the
evidence's quote and the document's name when the passage is gone, and linking
with `?passage=` when it still exists. Re-confirming stale evidence also
repoints `definition_source.passage_id` where it pointed at the old passage.

### Reason and excerpt in the mapping task

Prompt version 2. Each pair is
`{ passage, requirement, reason, excerpt?, confidence }`.

- **`reason`** is required. After trimming and collapsing newlines and control
  characters it must be 1–200 characters; otherwise the pairing is discarded and
  logged.
  - The prompt asks for one sentence, in the community's locale, on what the
    passage covers and what it leaves out, and forbids verdicts ("satisfies",
    "complies").
  - It is stored in `evidence.reason` and rendered as text: no markdown, no
    autolinking.
- **`excerpt`** is optional. It is matched against the passage text with
  whitespace normalised on both sides; the first match's offsets in the original
  text are stored. No match means the excerpt is dropped and the pairing kept.
- **`confidence`** stays required and stored. No load function returns it.
- **Input.** Passages are numbered with an `under` heading. Headings are never
  numbered passages.

### Versions

A new table:

```
document_file_version
  id | document_id → document (cascade) | community_id | filename | mime | bytes
     | sha256 | storage_key | extractor_version
     | uploaded_by → user (set null) | uploaded_at
     | superseded_by → user (set null) | superseded_at
```

The `document` row keeps describing the **current** file. Versions are only
earlier files.

**`replaceDocument(ctx, documentId, file)`** requires `document.upload`:

1. `receiveUpload`, the full envelope.
2. Refuse when `sha256` equals the current file's.
3. `uploadRefusal` counts current files **plus versions** against the storage
   ceiling, and counts the replacement against the member's upload rate limits.
   The re-check moves **inside** the writing transaction — today
   `createDocument` checks limits outside any transaction (its own comment
   claims otherwise), so two concurrent uploads can pass the storage ceiling
   together. Fixed here for upload, replace and restore alike.
4. One transaction:
   - insert a version row from the current fields, with this member and now as
     `superseded_*`;
   - `staleEvidenceForDocument`;
   - delete passages and clear the search index;
   - update the row with the new file fields and `uploaded_by`/`uploaded_at`;
   - set `status = 'uploaded'`, clear the page counts and `extractor_version`,
     increment `content_generation`;
   - set `scan_status = 'none'`, clear `scan_*` and `mapping_done_*`;
   - enqueue extraction.
5. The old file stays on disk, referenced by its version row.

**`restoreVersion(ctx, documentId, versionId)`** requires `document.upload` and
is the same transaction with the version's file:

- the current file becomes a new version row;
- the restored version row is deleted, and its storage key becomes the
  document's;
- no bytes are copied, and the storage total is unchanged.

**`deleteVersion(ctx, documentId, versionId)`** requires `document.destroy`
(steward). It deletes the row, then the file after commit.

**`deleteDocument`** deletes version files as well as the current file, rows
first and files second, as `purge.ts` does.

**Orphans.** A new per-file sweep in the purge job removes files under a live
community's directory that neither a document nor a version references. (The
existing sweep works per community directory, so this is new code, not an
extension.) It covers a crash between commit and file removal.

Version files are served by `…/documents/[id]/versions/[versionId]/file` with
exactly the guards and headers of the current file route. The two share one
helper.

**Erasure** never deletes a user row — it tombstones it — so the FKs stay
populated and need no erasure code. What matters is rendering: uploader and
replacer names go through `personLabel`, the rendering modules are listed in
`tests/support/person-surfaces.ts`, and the data inventory lists
`document_file_version` (a filename can carry a name).

The tenant registry's `subject` union gains `documentVersion`, and the
cross-tenant suite's seeding (`subjectInA`) seeds one — a declared but unseeded
subject fails the suite.

**Why keep the document row as the current file** rather than pointing at a
current version row: every existing read path (extraction, search, export, file
route) keeps working unchanged, and versions are a list nobody reads unless they
ask.

### The shared form-action helper

`src/lib/server/http/form-action.ts` exports the `run(step, act)` wrapper: it
awaits, maps 400/409/422 to `fail`, and rethrows everything else. The discussion
and document routes both import it, and its unit test replaces the two implicit
copies.

### Notifying the member a job ran for

`notify` gains `includeActor?: boolean`, default `false`. `export-job` passes it,
which fixes `export.ready`. The scan job passes it with
`kind: 'document.scan_ended'`, `subjectType: 'document'`, and a summary of
"Scan of bylaws-2019.pdf finished: 23 passages to review" or "Scan of
bylaws-2019.pdf stopped: <reason>".

**The surface it lands on.** No screen lists notification rows today — the only
rendering is the unread count on the Discussions nav in `TopBar.svelte`, and
`listNotifications` has no page. This change writes the rows correctly (they
are the durable record, and `export.ready` was silently lost until now) and
extends the existing unread count to include them; a notifications list screen
stays with the notifications backlog and is not smuggled in here. The scan's
outcome is also always visible on the document and library screens themselves,
which is where a member acts on it. The row is written inside the transaction that
records the terminal scan state.

### Upload

- **`upload` action** accepts `file` repeated, at most 10 per submission. Each
  file goes through `receiveUpload` + `createDocument` independently. It returns
  `{ results: [{ filename, ok, error? }] }`; a refusal of one file never undoes
  another.
- **With JavaScript**, `UploadDropZone` intercepts the submission (and drops)
  and sends one request per file in sequence to the same action, showing a result
  line per file as each returns. The body limit therefore stays one file's
  ceiling.
- **Without JavaScript**, the form posts all chosen files together. The control
  says "Up to 10 files, 25 MB each (25 MB in total without JavaScript)". A total
  above the body limit is refused by the server before the application sees it,
  which is the accepted trade-off for the no-JS path.
- **Rate limits.** `UPLOAD_PER_USER_HOUR` defaults to 10, so one full drop
  would spend the whole hour. The default rises to 20 (the daily and community
  limits stay), and the refusal keeps naming the limit reached. The general
  request limiter (300/min) is nowhere near ten sequential posts.

### The Text view

`PaperView` is server-rendered, with passages through the markdown node pipeline.

- **Layout.** PDF: one sheet per page, with "Page N of M" and prev/next in
  `?page=`. The sheet for the page holding `?passage=` is shown. Other formats: a
  single sheet, with a heading outline in the side strip when headings exist.
- **Addressing.** Each passage has `id="passage-<id>"`.
- **Highlight states:** none, open, confirmed, selected.
  - Open and confirmed differ by an underline style as well as the token
    background.
  - Selected adds an outline.
  - Excerpts highlight the excerpt range within the passage; otherwise the whole
    passage.
- **Selection** is `?passage=`: a link with JavaScript off, `replaceState` plus
  scroll with it on. Selecting a card scrolls the document; selecting a passage
  selects its card.
- **Hand mapping.** Selecting text inside a paragraph with JavaScript sets the
  excerpt for hand mapping. Without it, the whole passage is mapped.

### Copy, pinned to the design

Screen 05 and 09 strings the screens use verbatim (through paraglide messages,
because the i18n ratchet fails lint on new untranslated literals):

- Rail header: "bylaws-2019.pdf — 23 passages found, 14 mapped to clauses."
  (filename included); below it the coverage line "You already have language
  for 38 of 187 requirements."
- Cards section label: "SUGGESTED MAPPINGS" with "✦ AI-drafted · nothing is
  applied until you confirm".
- Card meta: "bylaws-2019.pdf · p. 4, ¶2" (filename included).
- Confirmed cards get the design's distinct treatment (tinted border and
  background) as well as the "Mapped" line — state is never colour alone.
- Pane footer buttons name their target: "‹ Page 3" / "Page 5 ›".
- Library header: "Documents", with a description rewritten from the design's
  (its "Compass reads a document" no longer holds — scans are member-started):
  "Everything {community} has already written down. Upload a document, start a
  scan, and Compass suggests which RCOS clause each passage answers. You
  confirm or reject every suggestion."
- Library counts line: "5 documents · 38 of 187 requirements already have
  language somewhere in them."
- Drop zone: "Drop PDFs, Word files or plain text here" / "Bylaws, meeting
  minutes, handbooks, land agreements." plus the member-visibility notice and
  the limits sentence; "Browse files" as the control.
- Library footer: "Compass never changes a document. Mapping only proposes
  where its language could satisfy a clause."
- Empty library: the existing "you are probably further along than the
  dashboard says" copy stays (UI Spec §4.10 — no empty shelf staring at
  anyone).
- Per-state progress lines: *Not scanned* "Not scanned yet"; *Scanning*
  "Scanning · 18 of 42 paragraphs read"; *Mapping in progress* "14 of 23
  passages mapped"; *Mapped* "9 of 9 passages mapped · 3 became definitions";
  *Not governance* "Nothing in it answers a requirement"; *Can't be scanned*
  the extraction reason; hand-mapped documents "2 passages mapped by hand".
- The primary action is emphasised (accent) for *Start RCOS mapping* and
  *Continue mapping*, neutral for *Review mapping* and *Open document*, per the
  sample data's `primary` flag.
- Type badges: `PDF`, `DOC`, `ODT`, `MD`, `TXT`.

Recorded deviations from the mock:

- "Mark as reference only" and its counterpart "Include in mapping" are
  dropped: `reference_only` keeps its single meaning (extraction couldn't read
  the file), and excluding a readable document from scanning is just not
  scanning it.
- "No passages extracted yet" (mock's not-mapped row) is wrong for an extracted
  document and is replaced by "Not scanned yet".
- The strength badges ("Strong match", "Partial — no end act") are replaced by
  the reason sentence, in the rail and the queue both.
- The drop zone's "nothing is published unless the assembly publishes it" is
  replaced by the notice fixed in `document-paragraphs` — documents can never
  be published.
- Page counts show for PDFs only; extraction has no page notion for Word/ODT
  (the mock's "Word · 18 pages" can't be produced honestly).
- The queue's "your bylaws already speak to this ref" becomes "your documents
  already speak to this ref".
- The TopBar gains an optional sub-crumb so the workspace can show
  "Documents / bylaws-2019.pdf" as designed (`TopBar.svelte` has crumb only).
- The Text view for a PDF has no thumbnail strip — page navigation only; the
  mock's thumbnails belong to the Original view (`document-original-view`).

### Workspace (≥1024px) and queue (<1024px)

- **Workspace.** Full-height mode with two panes; the document pane is ~45% wide.
  - *Rail header:* "N passages found, M mapped", a coverage bar with "You already
    have language for X of Y requirements", and the scan block (button with
    estimate, progress "Scanning · 18 of 42 paragraphs read", or the disabled
    reason).
  - *Cards:* the note "✦ AI-drafted · nothing is applied until you confirm"
    above them; the re-confirm block after a replacement; cards in document order.
  - *Pane footer:* page nav, "N passages on this page · M pages contain
    governance language", and "Jump to next unmapped passage →" (next open
    `?passage=` in document order, wrapping) or "Every identified passage has an
    answer" with **Mark mapping as done** where it applies.
- **Card.**
  - Quote; "p. 4, ¶2", where ¶ counts `paragraph` passages on the page, not
    headings.
  - `§ref`, clause name and reason.
  - A **`RequirementTip`** — a new component; `HelpTip` renders only static
    help-registry entries and can't carry clause data. Per the design it
    expands inline in the card (the `?` control) with a **Hide** control and
    shows: a header "RCOS-Core v0.1 · §3.6.2" (adopted standard name and
    version) with the normativity badge; the localised clause text; a footer
    composing layer and owning artifact ("Layer 1 · Membership → Exit &
    Separation Protocol"); and "Open in Standard →". The standard page anchors
    per artifact only today, so it gains per-clause anchors as part of this
    change. The design's "Satisfied when a definition names both the notice
    and the settlement." has no data behind it (no per-clause satisfaction
    criterion exists in standard content) and is dropped, recorded here.
  - Actions for open suggestions; "Mapped · confirmed by Ana, 29 Aug" and "Turn
    into definition →" for confirmed claims — offered only when the clause has
    an owner section, since `turnIntoDefinition` answers 409 otherwise.
  - A selected paragraph with no evidence shows a hand-mapping card.
- **`ClausePicker`.** A Bits UI combobox over the answerable clause list
  (`{ key, ref, title, question, layer }`, ~200 items in the load). Without
  JavaScript it degrades to a text input with a `datalist` of refs.
- **Queue (<1024px)** — `MappingQueue`, the same data.
  - *Header:* the document name, "14 of 23 done" and a bar, then the design's
    stepper "1 · Read it" / "2 · Confirm the ref" with step 1 ticked on the
    confirm step.
  - *Steps* in `?step=read|confirm` with `?passage=`. Step 1: "Passage 15 of
    23" over the paper card, with "page 4, ¶2 · see it in the page". Step 2:
    the "Suggested ref" block — "RCOS-Core v0.1 · §3.6.2" over the clause name
    with the `RequirementTip` behind the same `?` control as in the rail — the
    reason, and "Confirming does not adopt this language. It records that your
    documents already speak to this ref."
  - *Buttons:* Confirm §3.6.2 / Change ref / Not governance, all ≥44px.
    Confirming moves to the next open suggestion; a passage with two open
    suggestions is presented once per suggestion.
  - "See it in the page" shows the Text view at that passage with a back link.
    Selecting an unmapped paragraph there offers hand mapping, so mapping by
    hand exists on a phone.
  - *Above the queue* sits the same scan block as the rail (start with
    estimate, progress, or the disabled reason), so a phone member can start
    and continue scans.
  - *Finished and empty states:* when nothing is open, the queue shows "Every
    identified passage has an answer" with **Mark mapping as done** where it
    applies, the re-confirm block after a replacement, and the list of
    confirmed claims with "Turn into definition →" — nothing the workspace
    offers is desktop-only.
- **Polling.** While the scan is live and not stalled, the library and workspace
  `invalidate` every 3 seconds. Polling stops on a terminal state, a stall, or
  after 15 minutes.

### Library

`libraryView(ctx, filter)` returns rows, per-filter counts and
`languageCoverage`. For each row:

- **Type badge** from the MIME type, and meta ("PDF · 11 pages · 1.4 MB", pages
  for PDF only).
- **Uploader and date** through `personLabel` (`services/person.ts`), with the
  rendering module listed in `tests/support/person-surfaces.ts`.
- **State chip** from `mappingStateOf`.
- **Progress:** "14 of 23 passages mapped · 3 became definitions"; for a manual
  document "2 passages mapped by hand"; for a not-governance document "Nothing in
  it answers a requirement".
- **Primary action:** Start RCOS mapping (or Map by hand when a scan is
  unavailable), Continue mapping, Review mapping, or Open document.
- **⋯ menu (Bits UI dropdown).** Every item is a link or a single-field form, and
  items the member may not use are hidden:
  - Start RCOS mapping;
  - Open document;
  - Replace with a newer file — a file-input form;
  - Previous versions — opens `VersionList` with download, restore, and delete
    for stewards;
  - Remove from library — a confirmation naming the confirmed claims that will
    go stale and the versions that will be deleted.

## Risks / Trade-offs

- **[A member replaces bylaws with something harmful]** → The previous file is a
  version anyone can restore. Only a steward can delete versions. Replacements
  count against upload rate limits and the storage ceiling.
- **[Versions fill the storage ceiling]** → The refusal names the ceiling and
  says stewards can delete old versions; the library shows version count per
  document. Automatic pruning is a later decision.
- **[Scan cost surprises a member]** → The estimate is shown before starting,
  charged per batch to whoever starts or continues, and a passage is never paid
  for twice.
- **[Stall threshold too short for a slow provider]** → 10 minutes against a
  batch of 12 short passages; the heartbeat moves every batch; a false stall only
  lets someone start another scan, and the generation check stops the old one
  from writing.
- **[Model reason reads like a verdict]** → The prompt forbids verdict words, the
  AI-drafted label sits above every list, and a reason changes no state. The
  injection fixture asserts inert text.
- **[Queue on a landscape tablet over 1024px gets the two-pane layout]** → That's
  the intent; two panes fit at 1024.
- **[No-JS multi-file total over the body limit gets a bare 413]** → Stated on
  the control. The JavaScript path, which almost everyone has, sends one file per
  request.
- **[Polling load]** → Only while a scan is live, only for members on those two
  screens, stopping on a terminal state, a stall or a timeout.

## Migration Plan

1. One migration:
   - `passage.scanned_at`;
   - `document.scan_status` (default `none`), `scan_detail`, `scan_actor`,
     `scan_heartbeat_at`, `content_generation` (default 0), `mapping_done_at`,
     `mapping_done_by`;
   - `evidence.reason`, `excerpt_start`, `excerpt_end`, `document_id`,
     backfilled through `passage_id`;
   - the `document_file_version` table.
2. Backfill: a document with non-stale AI evidence gets `scan_status = 'stopped'`
   with "This document was scanned before Compass recorded progress. Continue
   the scan to make sure nothing was missed.", and `scanned_at` on passages that
   have evidence. After `document-paragraphs` re-read everything this is expected
   to match nothing, but it is correct if it does.
3. `docs/13-data-inventory.md` and the erasure path are updated in the same
   commit as the schema, or the data-inventory test fails.
4. Rollback: the previous build ignores new columns and the version table.
   Replaced documents keep their current file; version files stay on disk until
   the orphan sweep of the new build, which the old build doesn't run.

## Open Questions

_None blocking._ The tuning values (batch size 12, stall 10 minutes, poll 3s with a
15-minute cap, 10 files per upload) are constants to revisit after the pilot.

## 1. Shared groundwork

- [x] 1.1 Move the `run(step, act)` form-action wrapper into `src/lib/server/http/form-action.ts`; switch the discussion and document routes to it
- [x] 1.2 Add `includeActor` to `notify`; pass it from `export-job.ts`; add `document.scan_ended` to the notification kinds and `document` to subject types with its link target; include the new kinds in the TopBar unread count (no notifications list screen exists — that stays with the notifications backlog, recorded in design.md)
- [x] 1.3 Add a `no-js` Playwright project (`javaScriptEnabled: false`) that runs only specs tagged `@no-js`, so "works without JavaScript" is tested rather than claimed
- [x] 1.4 Tests: unit test for the form-action wrapper (400/409/422 become `fail`, others rethrow, async rejections are caught); integration test that `export.ready` reaches the member who requested the export and nobody else

## 2. Schema, migration and inventory

- [x] 2.1 `passage.scanned_at`; `document.scan_status` (default `none`), `scan_detail`, `scan_actor` (set null), `scan_heartbeat_at`, `content_generation` (default 0), `mapping_done_at`, `mapping_done_by` (set null)
- [x] 2.2 `evidence.reason`, `excerpt_start`, `excerpt_end`, `document_id` (backfilled from the passage, kept when the passage is gone)
- [x] 2.3 `document_file_version` table with user references set null
- [x] 2.4 Migration backfill: documents with non-stale AI evidence become `stopped` with the "scanned before progress was recorded" sentence, and passages with evidence get `scanned_at`
- [x] 2.5 Make `staleEvidenceForDocument` keep `document_id`; increment `content_generation` in the extraction job's passage replacement
- [x] 2.6 Update `docs/13-data-inventory.md` for `document_file_version` (filename, uploader, replacer) and the new user references — erasure tombstones the user row, so no per-column erasure code; every module that renders these names uses `personLabel` and is listed in `tests/support/person-surfaces.ts`
- [x] 2.7 Tests: migration on a fixture with an AI-mapped document asserts the backfill; `data-inventory.test.ts` passes; an erased uploader and replacer render per `personLabel` on the library and version list (the rendering half lands with 8.1, where the library view is built)

## 3. The mapping state

- [x] 3.1 `services/mapping-state.ts`: pure `mappingStateOf({ status, scanStatus, scanStalled, identified, open, doneAt })` returning state and primary action, per the table in `design.md`
- [x] 3.2 `libraryCounts(ctx)` and `documentCounts(ctx, documentId)`: one grouped query each for identified, open, became-definitions and governance pages, counting paragraph passages and non-stale evidence only, with the `visibleTo` helper applied inside the query (a `restricted` document appears in no list or count for a member who may not see it)
- [x] 3.3 `markMappingDone` and `reopenMapping` in `services/documents.ts` (`mapping.confirm`), refusing while anything is open or a scan is live; register both in the tenant registry
- [x] 3.4 Tests: a unit table covering every row and the listed consequences (one hand mapping is in progress; stopped with nothing open is in progress; complete with nothing identified is not governance; done-mark makes a hand-mapped document mapped; stalled counts as stopped); integration tests that counts ignore stale evidence, headings and other communities; mark-done refused while open or live; cross-tenant mark-done answers not found

## 4. The mapping task explains itself

- [x] 4.1 Prompt v2 in `ai/prompts/map-document.ts`: one-sentence reason in the community locale with no verdict words, optional verbatim excerpt, `under` heading per passage; Valibot and JSON schemas updated
- [x] 4.2 `ai/tasks/map-document.ts`: discard pairings with no or over-long reason after normalising; resolve the excerpt with whitespace-normalised matching, dropping it when absent; never number `heading` passages
- [x] 4.3 Update the fixture provider and recorded fixtures to prompt v2
- [x] 4.4 Tests: reason and excerpt stored; invented excerpt dropped, suggestion kept; missing or long reason discarded and logged; the injection fixture demanding a link or HTML in the reason yields literal text; headings never numbered; no load returns `confidence` (asserted with the workspace load in 10.9)

## 5. The scan job

- [x] 5.1 `scanAvailability(ctx, document)` returning ok with paragraph and already-read counts, or the one sentence per case in `design.md`
- [x] 5.2 `startScan(ctx, documentId)`: permission and availability checks, the conditional claim update (including stalled scans), clearing the done mark, enqueueing `document.scan` with the content generation; register in the tenant registry
- [x] 5.3 `jobs/scan-job.ts` (one batch per job step, chaining the next — a long document never holds the queue): rebuild `Ctx`; stop if membership or `ai.run` is gone; batches of 12 unread paragraphs in document order within the page ceiling; availability re-check per batch; per-batch transaction verifying generation and live status before writing suggestions, `scanned_at` and heartbeat; `stopped` with reason on refusal; `complete` at the end; wrapped so any throw records `stopped` and completes the job; notification with `includeActor` inside the terminal transaction
- [x] 5.4 Remove the awaited `suggest` action and the `mapping.run` registry entry; keep the batch loop as the job's internals
- [x] 5.5 Tests: upload and extraction make no AI call; two concurrent starts queue one job; scans on two documents in different communities both queue; no `ai.run` refused; cross-tenant start answers not found and queues nothing; budget refusal on batch 4 keeps 1–3, stops with the reason, and continuing sends only unread paragraphs; a paragraph with no suggestion is never sent twice; replacing the file between batches leaves no suggestions or read marks on new passages; removing the document mid-scan ends quietly; the actor leaving stops the scan with no further call; AI switched off mid-scan stops it; a thrown error records `stopped` and the job is not retried; a stale heartbeat is claimable again; the actor gets one notification on complete and on stop, nobody else does, and a departed actor gets none; with `AI_PROVIDER=null` availability returns the sentence and nothing errors

## 6. Evidence acts

- [x] 6.1 `changeClause`: dismiss the suggestion and confirm the chosen clause for the passage in one transaction, reusing any existing pairing row
- [x] 6.2 `dismissPassage`: dismiss every `suggested` row on a passage, leaving `confirmed` rows
- [x] 6.3 `mapPassage` optional excerpt range, validated
- [x] 6.4 `reconfirmCandidates` (same document via `evidence.document_id`, `sha256(quote)` equals a current `text_hash`) and `reconfirm`, confirming an existing pairing instead of repointing when one exists, and repointing `definition_source.passage_id` where it pointed at the old passage
- [x] 6.5 Rewire `definitionOrigin` through `definition_source.evidence_id` → `evidence.document_id` so a definition's "from bylaws-2019.pdf, page 4" line survives replace, restore and re-read (today it inner-joins `passage` and silently vanishes); fall back to quote + document name when the passage is gone; link with `?passage=` when it exists
- [x] 6.6 Export `resolveClause` from `services/evidence.ts` (it is private today)
- [x] 6.7 Register every new act in the tenant registry
- [x] 6.8 Tests: change clause is atomic, reuses a dismissed pairing, refuses an unknown ref leaving the suggestion open, refuses without `mapping.confirm`, answers not found cross-tenant; not governance leaves confirmed rows; out-of-range excerpt refused; an unchanged paragraph after replacement is offered and stays stale until re-confirmed; re-confirming where a new scan suggested the same pairing confirms that row with no constraint error; a changed paragraph is not offered; cross-tenant re-confirm answers not found; no act moves readiness; a definition keeps its origin line after its document is replaced and after a re-read

## 7. Versions, replace and restore

- [x] 7.1 `uploadRefusal` counts current files plus versions against the storage ceiling, and the re-check moves inside the writing transaction for upload, replace and restore — today `createDocument` checks limits outside any transaction, so two concurrent uploads can pass the ceiling together; raise the `UPLOAD_PER_USER_HOUR` default to 20 so one 10-file drop doesn't spend the whole hour
- [x] 7.2 `replaceDocument`: `document.upload`; full envelope and rate limits; same-hash refusal; one transaction creating the version row, staling evidence, clearing passages and search index, updating the file fields, resetting status, reader version, scan and done state, incrementing the generation, enqueueing extraction
- [x] 7.3 `restoreVersion` (swap without copying bytes) and `deleteVersion` (steward; row then file after commit)
- [x] 7.4 `deleteDocument` removes version rows and files; add a per-file orphan sweep to `jobs/purge.ts` for files under a live community referenced by neither a document nor a version (the existing sweep is per community directory — this is new code)
- [x] 7.5 Route `…/documents/[id]/versions/[versionId]/file` sharing one guarded streaming helper with the current file route
- [x] 7.6 Register replace, restore and delete-version in the tenant registry; add `documentVersion` to the registry's subject union and seed it in the cross-tenant suite's `subjectInA` (a declared but unseeded subject fails the suite)
- [x] 7.7 Tests: replacement keeps the id, creates a version with uploader and replacer, stales claims, re-extracts; validation refusal changes nothing; same hash refused; versions push the ceiling and the refusal names it; member without `document.upload` refused; restore swaps and re-extracts with unchanged storage total; a member cannot delete a version, a steward can; removing a document removes all version files; a crash after commit leaves an orphan the sweep removes; version file route answers not found anonymously and cross-tenant, and serves as attachment with `nosniff`

## 8. The library screen (design 09)

- [x] 8.1 `libraryView(ctx, filter)`: rows through `mappingStateOf`, meta, `personLabel` attribution, the per-state progress sentences pinned in design.md, version count per row, per-filter counts, coverage
- [x] 8.2 Rewrite `documents/+page.svelte` with the copy pinned in design.md: header and rewritten description, *Upload documents*, `UploadDropZone` with the limits sentence and the upload notice, the "5 documents · 38 of 187…" counts line, filter control in `?filter=`, the footer "Compass never changes a document. Mapping only proposes where its language could satisfy a clause.", and the existing empty-state copy kept; all new strings through paraglide messages (the i18n ratchet fails lint otherwise)
- [x] 8.3 `upload` action: up to 10 `file` fields, each independent, results per file; `UploadDropZone` sends one request per file with JavaScript and shows each result
- [x] 8.4 `DocumentRow`: type badge (`PDF`/`DOC`/`ODT`/`MD`/`TXT`), name, state chip (not colour alone), meta, progress line and bar, primary action by state with the accent emphasis on *Start RCOS mapping* and *Continue mapping* only, disabled *Start RCOS mapping* with its reason
- [x] 8.5 Row menu: Start RCOS mapping, Open document, Replace with a newer file, Previous versions (`VersionList` with download, restore, steward delete), Remove from library with the claims-and-versions confirmation; permission-gated
- [x] 8.6 Poll with `invalidate` while any row's scan is live and not stalled, stopping at terminal, stall or 15 minutes
- [x] 8.7 Gallery entries for `DocumentRow` (every state), `UploadDropZone`, `VersionList`
- [x] 8.8 Tests: e2e three files with one refused shows three outcomes; eleven files refused whole; the notice text exact; filters change list, counts and URL; a member's menu shows replace and versions but not remove; crafted removal by a member refused; replace then restore through the menu; the no-JS project uploads two files; a11y scan at 375 / 768 / 1024 / 1440

## 9. The text view

- [ ] 9.1 `PaperView`: page sheets with `?page=` navigation for PDFs, one sheet with heading outline otherwise; passages through the markdown node pipeline with `id="passage-<id>"`; highlight states (open, confirmed, selected) differing by more than colour; excerpt highlighting; ¶ numbering over paragraphs only
- [ ] 9.2 Selection in `?passage=`: links without JavaScript, `replaceState` and scroll with it; text selection inside a paragraph sets the hand-mapping excerpt
- [ ] 9.3 Gallery entry with a hostile-text passage and an excerpt
- [ ] 9.4 Tests: `.docx` shows headings, paragraphs and outline; page link opens the page; an XSS passage renders as words; an excerpt highlights only its sentence; "¶2" after a heading; the no-JS project reads text and pages and downloads the file

## 10. The workspace (design 05)

- [ ] 10.1 Rewrite `documents/[id]/+page.server.ts`: document, passages, evidence (reason, excerpt, confirmer, date — never confidence), counts and state, coverage, scan availability or progress, answerable clause list, details for clauses on cards, re-confirm candidates, versions, permissions; `fullHeight`
- [ ] 10.2 Actions through the shared wrapper: `startScan`, `confirm`, `dismiss`, `changeClause`, `dismissPassage`, `map`, `reconfirm`, `markDone`, `reopen`, `draft`, `replace`, `restore` — each returning to the same `?passage=`
- [ ] 10.3 Two panes at ≥1024px; rail header "{filename} — N passages found, M mapped to clauses." with the coverage bar; the "Suggested mappings" label and AI-drafted note; scan block with estimate / progress / reason; re-confirm block; TopBar gains an optional sub-crumb showing the filename
- [ ] 10.4 `SuggestionCard`: quote, "{filename} · p. 4, ¶2", `§ref`, clause name, reason, open-suggestion actions, confirmed state with the design's tinted treatment, confirmer line and *Turn into definition →* (only when the clause has an owner section — `turnIntoDefinition` answers 409 otherwise); hand-mapping card for a selected unidentified paragraph
- [ ] 10.4b `RequirementTip` (new component — `HelpTip` is registry-only): inline expansion with *Hide*, "RCOS-Core v0.1 · §ref" header, normativity badge, localised clause text, "Layer N · Artifact" footer, "Open in Standard →"; give the standard page per-clause anchors for that link
- [ ] 10.5 `ClausePicker`: Bits UI combobox over ref, name and question with a `datalist` fallback
- [ ] 10.6 Pane footer: page nav, passages-on-page and governance-pages sentence, next open passage link (wrapping) or the all-answered sentence with *Mark mapping as done*
- [ ] 10.7 Polling while the scan is live, with the same stop rules as the library
- [ ] 10.8 Gallery entries for `SuggestionCard` (open, confirmed, no reason, hand mapping) and `ClausePicker`
- [ ] 10.9 Tests: e2e with the fixture provider — library → *Start RCOS mapping* (estimate shown) → scanning → cards with reasons and no strength → confirm, change clause by typing, dismiss, not governance → document *Mapped* → *Turn into definition* lands on a pre-filled draft; the same by hand with `AI_PROVIDER=null` ending in *Mark mapping as done*; a member without `mapping.confirm` sees no actions; next open passage wraps and gives way to *Mark mapping as done*; change clause without JavaScript; keyboard-only run of every action; rewrite `tests/e2e/documents.spec.ts` for the new screens

## 11. The queue below 1024px (design 16b)

- [ ] 11.1 `MappingQueue`: document name, done count and bar, the "1 · Read it / 2 · Confirm the ref" stepper, "Passage N of M", `?step=read|confirm` with `?passage=`, paper card with "page 4, ¶2 · see it in the page", the "Suggested ref" block with `RequirementTip` behind the `?`, reason, the non-adoption sentence ("…your documents already speak to this ref."), *Confirm §ref* / *Change ref* / *Not governance* at ≥44px; a passage with two open suggestions is presented once per suggestion
- [ ] 11.2 The scan block above the queue; the finished state with *Mark mapping as done*, the re-confirm block and confirmed claims with *Turn into definition →* — nothing the workspace offers is desktop-only
- [ ] 11.3 "See it in the page" shows the text view at the passage with a way back; selecting an unmapped paragraph there offers hand mapping
- [ ] 11.4 Gallery entry at 375 and 768
- [ ] 11.5 Tests: at 375 confirming advances and increments the count; a two-suggestion passage is asked twice; at 768 the queue is shown, not two panes; "see it in the page" highlights the passage and returns; a phone member can start a scan, map by hand and mark mapping done; touch targets measure ≥44px; a11y scan of the queue at 375 and 768

## 12. Documentation

- [ ] 12.1 `docs/03-data-model.md`: scan columns and state machine, `content_generation`, done mark, evidence reason / excerpt / document, `document_file_version`, the derived mapping states
- [ ] 12.2 `docs/04-security.md` §1: who may replace, restore and delete versions; §5.3: scans charged to whoever starts or continues
- [ ] 12.3 `UI Spec — v0.1 (draft).md` §4.5: member-started scans, reasons instead of strength, versions; record the dropped design items ("Mark as reference only" / "Include in mapping", the strength badges, the per-clause "Satisfied when…" line, Word page counts)

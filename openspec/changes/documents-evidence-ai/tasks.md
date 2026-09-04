## 0. The target

- [x] 0.1 The e2e spec for the exit criteria, written first and marked `fixme` while it cannot pass: upload bylaws → extract → map a passage by hand → confirm → turn it into a definition pre-filled with the community's own words. It runs with `AI_PROVIDER=null` and never stops running there
- [x] 0.2 Fixture documents committed once and reused throughout: a readable PDF of plausible bylaws, a docx, an odt, a scanned PDF with no text layer, a 400-page PDF, a docx zip bomb, an executable named `.pdf`, and the injection document from `06` §6.7

## 1. Schema and configuration

- [x] 1.1 `document`, `passage`, `evidence`, `ai_call`, `ai_usage` (`03-data-model.md` §3), each `(community_id, …)`-first, with `evidence` unique per `(community_id, passage_id, clause_key)` so one passage cannot be mapped to one clause twice
- [x] 1.2 Evidence state as a DB-level constraint, not a drizzle enum — P3 proved `text({ enum })` is a TypeScript narrowing and nothing more
- [x] 1.3 Config: `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `MAX_UNZIP_MB`, `MAX_EXTRACT_PAGES`, `EXTRACT_TIMEOUT_S`, the upload rate and storage limits, and the `AI_*` set — including the cross-field rule that a provider other than `null` requires a key
- [x] 1.4 Migration generated and applied
- [x] 1.5 Tests: the constraints refuse what they exist to refuse, and config refuses a remote provider with no key or model while asking nothing of `null` and `fixture`. (The cross-tenant assertion moved to 5.6, where there is a service to make it against — at schema level it would only be testing SQL.)

## 2. Upload

- [x] 2.1 The upload route: stream with a byte ceiling, sniff magic bytes from the first chunk, refuse the moment extension and content disagree — all before the file reaches its final location
- [x] 2.2 Write to a temp path, move into `UPLOAD_DIR/<communityId>/<uuid>` as the last step of the transaction that creates the row, so neither a failed write nor a failed insert leaves an orphan
- [x] 2.3 Per-user and per-community upload limits and the community storage ceiling, each refusing with the limit named
- [x] 2.4 The authorised file route: tenant resolved by the pipeline, membership re-checked, streamed from disk. No public path and no signed URL
- [x] 2.5 The upload control states who will be able to read the file — every member — before a file is chosen, and deleting a document removes its row, its passages and the file itself
- [x] 2.6 Tests — the upload-abuse suite from `06` §6.8: oversized, mislabelled MIME, zip bomb, executable-as-PDF, encrypted PDF. Each fails cleanly, names the reason, and leaves no file and no row. Plus: another community's file is not served

## 3. Extraction

- [x] 3.1 `unpdf` for PDF text and `mammoth` for docx, in a job with the wall-clock ceiling; status moves `uploaded → extracting → extracted | reference_only | failed`
- [x] 3.2 ODT read by unzipping `content.xml` ourselves (`design.md`): the decompressed-size ceiling `.docx` already uses, an XML parser with DTD and external entities switched off, and a hostile fixture proving both
- [x] 3.3 Scanned-PDF detection → `reference_only` with the plain message, never zero passages presented as an empty document
- [x] 3.4 The page ceiling: extract up to it, report the remainder as not extracted
- [x] 3.5 Passages with page and ordinal; `bbox` left null and the column kept
- [x] 3.6 Failure is visible on the document, not only in the log — the first job whose outcome a member has to read
- [x] 3.7 Tests: each fixture document lands in the right status; a timeout leaves no partial passages; the 400-page PDF reports what it did not read; the scan says it is a scan

## 4. Passages and the viewer

- [x] 4.1 The document list and the document screen: status, what was extracted, what was not
- [x] 4.2 The passage viewer — passages in place, readable, with the document downloadable
- [x] 4.3 Passage text rendered through the P3 markdown pipeline, never as HTML. Document text is the most hostile text in the product and the rule is the same one: no `{@html}`, anywhere
- [x] 4.4 Tests: an XSS payload in a passage renders as words; the a11y pass covers the viewer at 375 / 768 / 1024 / 1440

## 5. Mapping by hand — the exit criteria, without any AI

- [x] 5.1 Manual passage → clause mapping, writing `evidence` as `confirmed` with its actor and time
- [x] 5.2 Confirm and dismiss on suggestions; a dismissed suggestion is not offered again and is not deleted
- [x] 5.3 "Turn this into a definition" — pre-fills a draft with the passage text; where the section already has an adopted definition, it opens a discussion with that text as the first proposal instead
- [x] 5.4 Evidence goes `stale` when its passage is superseded or the standard version changes; stale evidence stays readable and can be re-confirmed
- [x] 5.5 "You already have language for N of M requirements" — counted from confirmed evidence and shown **separately from readiness**, never as progress toward compliance
- [x] 5.6 Tests: confirmed evidence moves neither readiness nor the compliance claim; the version records the evidence it came from; a foreign passage is refused as nonexistent; **`fixme` comes off the 0.1 spec and it passes end to end on `AI_PROVIDER=null`**

## 6. The provider seam

- [x] 6.1 `AiProvider` and `AiResult` per `00-architecture.md` §4, with the `null` provider returning a documented "unavailable" result rather than throwing — one code path for no provider, a failed provider, and an exhausted budget
- [x] 6.2 The `fixture` provider, replaying `tests/fixtures/ai/*.json`
- [x] 6.3 The Google AI Studio adapter as `fetch` against the REST endpoint — no SDK, so the seam stays one file
- [x] 6.4 Prompts as versioned constants under `src/lib/server/ai/prompts/`; a task owns its prompt, its valibot schema and its output ceiling; no prompt is built inline in a service
- [x] 6.5 `ai_call` logging with a hash of the input and never the input; `ai_usage` rolled up per member per day and month
- [x] 6.6 Budgets checked before the call and reconciled after it — per-user day and month first, community month as the backstop; a refusal returns "unavailable", not an error
- [x] 6.7 AI off by default on a new community; enabling it is an owner-or-steward act on a screen naming the provider and its data terms; per-member usage visible to the member and to stewards
- [x] 6.8 **The boundary**: nothing under `src/lib/server/ai/` may import a service that writes. An ESLint rule plus a test that lints a file breaking it, the way the admin boundary and the component boundary are proved
- [x] 6.9 Tests: `null` and `fixture` behave identically to callers; a budget refusal is indistinguishable from no provider; the call log holds a hash and not the text; the boundary rule fails a file that breaks it

## 7. AI mapping suggestions

- [ ] 7.1 The mapping task: extracted text to the model inside a delimited data block, with a system prompt stating it is data and never instructions
- [ ] 7.2 Suggestions written only as `evidence` in `suggested` state, by an ordinary service with a `Ctx` and a permission check — the task returns data and writes nothing
- [ ] 7.3 Output validated against the task's schema; unparseable output discarded and logged, never retried indefinitely; a suggested clause outside the community's adopted standard discarded
- [ ] 7.4 A run is capped by the page ceiling, resumable, and charged to the member who started it; a run that stops mid-way keeps what it produced and says so
- [ ] 7.5 **Tests: the prompt-injection fixture (`06` §6.7) — the document telling the model to mark every clause satisfied and confirm all mappings produces at most suggestion rows and changes no state.** This passes before any of group 7 is considered done
- [ ] 7.6 Tests: a mapping run on the `fixture` provider produces suggestions a human then confirms; nothing reaches `confirmed` without a person

## 8. The linter's assisted half

- [ ] 8.1 `lintWithAssist(input, options)` — async, runs the rule set first, adds the assisted findings when a provider is available and in budget. `lint()` keeps its signature and stays synchronous, because the freeze path calls it on every render
- [ ] 8.2 `enf.auditable` (RCOS §2.4.3) and the full `type.mismatch` as AI tasks with their own prompts and schemas
- [ ] 8.3 Without a provider, in budget or otherwise, the panel says the assisted checks were **not run** — the shape `all.vague.unavailable` already established, for the same reason
- [ ] 8.4 Remove the cross-community statistic from the linter panel (spec review log #28)
- [ ] 8.5 Tests: the rule-based findings are identical with and without a provider; the unavailable finding appears on `null`; an assisted warning still cannot stop a freeze

## 9. Closing it

- [ ] 9.1 The e2e spec passes end to end with `AI_PROVIDER=null`, and again with `fixture` — the second must not be what makes it pass
- [ ] 9.2 The same spec at 375px: upload, read a passage, map it, turn it into a definition
- [ ] 9.3 Every service added in groups 2–8 registered in `services/registry.ts`, including the ones addressed by a document id, a passage id and an evidence id
- [ ] 9.4 A deleted community takes its upload directory with it, and an export carries the original files — both tested, because bylaws left on a volume after a community leaves is the failure that matters
- [ ] 9.5 `docs/03`, `docs/04` and `docs/06` updated wherever the build taught something the documents did not say, and the ODT decision from 3.2 recorded

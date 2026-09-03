## 0. The target, written first

- [ ] 0.1 The e2e loop spec from `docs/06-testing-strategy.md` §7, written against the seeded Valle Verde fixture and left failing — see the gap → discuss → decide → find it again. It is the definition of done for this change, and "nearly there" stays visible rather than asserted
- [ ] 0.2 The Valle Verde seed (`docs/06` §8): 27 members, Layer 0 complete, Layer 1 part-written, one open discussion, one adopted decision — the state the mockups show

## 1. Schema

- [ ] 1.1 `definition` (scope `standard|local`, nullable `section_key`, `local_artifact_id?`, `attached_to_artifact?`, `adopted_version_id?`, `provisional`, `review_due_at?`) and `definition_version` (immutable body, author, frozen_at, decision_id)
- [ ] 1.2 The partial unique index `UNIQUE(community_standard_id, section_key) WHERE section_key IS NOT NULL` — one answer per standard section, many local definitions
- [ ] 1.3 `draft` with `edit_token`, one live draft per definition
- [ ] 1.4 `local_artifact`, and the *Community Agreements* row created with every community
- [ ] 1.5 `discussion`, `post`, `proposal`, `objection`
- [ ] 1.6 `consent_round`, `consent_response` with `UNIQUE(round_id, user_id)`
- [ ] 1.7 `decision` with `UNIQUE(community_id, seq)` and `UNIQUE(community_id, idempotency_key)`, plus `change_log_entry`
- [ ] 1.8 `notification` and `standard_feedback`
- [ ] 1.9 Tests: migrations apply; the partial index permits many local definitions and exactly one standard definition per section; a second response from one member replaces rather than duplicates; a duplicate idempotency key is refused by the database, not only by the service

## 2. Definitions and drafts

- [ ] 2.1 `services/definitions.ts` — create, read, list by artifact, with `Ctx` and no community id from input; registered in `services/registry.ts`
- [ ] 2.2 Scope rules: a `local` definition may not name a section; a `standard` one must; the second definition for a section is refused and the existing one offered
- [ ] 2.3 Draft autosave with `edit_token`, rotated on each save; a stale token refuses and returns who else is editing and what changed
- [ ] 2.4 `standard_feedback` from the "RCOS should require this" checkbox, stored with the community's own text
- [ ] 2.5 Tests: the `definitions` spec in full, including a local definition that names a section being refused, a stale token that does not overwrite, and the cross-tenant case the registry suite adds automatically

## 3. Discussions, posts and proposals

- [ ] 3.1 `services/discussions.ts` — open against a clause or a definition, post, list; registered
- [ ] 3.2 Proposals as their own records with versions, authors, and the actions that hang off them
- [ ] 3.3 *Take offline*: mark decided offline with a summary and the proposal that came out of the room, reaching the same freeze
- [ ] 3.4 Tests: the `discussions` spec in full — a member may propose and may not freeze; a freeze with no proposal is refused and says why; an offline decision records that it happened offline

## 4. Objections and consent rounds

- [ ] 4.1 Objections with the `open → withdrawn | addressed | overruled` lifecycle, attributable, and not deletable
- [ ] 4.2 `VotingProvider` interface — `openRound`, `respond`, `tally` — with the built-in consent round as the default provider
- [ ] 4.3 Round closing: at the deadline, or when the last eligible member responds
- [ ] 4.4 Tests: the `consent` spec in full — a second response replaces the first, an outsider's response is refused, closing a round creates no decision, and the freeze path depends on a `Tally` and on no provider-specific type

## 5. Freeze and the decision register

- [ ] 5.1 `services/decisions.ts` — the freeze in one transaction: decision, version, change-log entry, and the definition's adopted version
- [ ] 5.2 `seq` from `max(seq) + 1` inside that transaction, `ref = DEC-<year>-<seq>` with the year taken from the community's timezone
- [ ] 5.3 Idempotency: insert on the unique key, return the existing decision on conflict rather than raising
- [ ] 5.4 The interim adoption rule — provisional while the Decision Matrix is incomplete — and the ratification sweep that lists them once it is adopted
- [ ] 5.5 Ratification Records rendered from the adopting decision for `filled_from_decision` sections, with no `definition` row created
- [ ] 5.6 Unresolved objections counted onto the decision and shown wherever it appears
- [ ] 5.7 Tests: the `decisions` spec in full — three consecutive numbers, a rolled-back freeze that consumes none, 23:59 on 31 December in a non-UTC community, a double submit producing one decision, and two stewards freezing at once producing one

## 6. Readiness and compliance

- [ ] 6.1 `services/readiness.ts` — readiness per layer and per community, computed from the loaded standard, memoised per request
- [ ] 6.2 Artifact completeness over `authoredSections()` only, ignoring local definitions
- [ ] 6.3 Compliance: binary, false while any MUST-satisfying definition is provisional, module figures never summed into core
- [ ] 6.4 `invalidate('community:readiness')` and the matching `depends()`, so a freeze refreshes every panel that shows a number
- [ ] 6.5 Tests: the `readiness` spec in full, plus the arithmetic table from `docs/03-data-model.md` §7 — a stale definition still counts, a local definition moves nothing, and a module at 100% with core incomplete still reads as not compliant

## 7. Notifications

- [ ] 7.1 `notification` rows written per recipient as events occur, never for the actor themselves
- [ ] 7.2 In-app list and read state, scoped per community and withheld from an ended membership
- [ ] 7.3 The weekly digest job, enqueued rather than sent in-request, carrying counts and a link and no content
- [ ] 7.4 Tests: the `notifications` spec in full — a former member gets nothing, a quiet week sends nothing, and a digest body contains no definition or discussion text

## 8. The linter

- [ ] 8.1 The rule-based checks from `docs/11-definition-linter.md`: subject, process, consequence, vague-word detection, and the three type chips
- [ ] 8.2 Tests: each check against a definition that passes and one that fails; the panel never blocks a freeze

## 9. Screens

- [ ] 9.1 Dashboard — readiness by layer, *Your next 5* from the vendored annotation edges, needs-attention, recently decided
- [ ] 9.2 Standard browser — the community's status woven into the spec, filters, "show only gaps"
- [ ] 9.3 Definition detail — the three-column hero, tabs below 1024px, the linter panel, *In plain words*, the local-additions block
- [ ] 9.4 Discussions list and thread, with the proposal block and the Freeze modal including the provisional notice
- [ ] 9.5 Decision register — the dense table, an expanded row, and the reverse-lookup question box
- [ ] 9.6 Tests: the gallery gains every new primitive; the a11y pass covers each screen at 375 / 768 / 1024 / 1440; a keyboard-only pass and a `prefers-reduced-motion` pass of the loop

## 10. Closing the loop

- [ ] 10.1 The e2e spec from 0.1 passes end to end on a fresh community, and readiness moves by exactly the right amount
- [ ] 10.2 The same spec passes at 375px, including drafting, responding to a consent round and freezing
- [ ] 10.3 The cross-tenant suite covers every service added here, because each is registered
- [ ] 10.4 `docs/03-data-model.md`, `docs/06-testing-strategy.md` and the UI spec updated wherever the build taught us something the documents did not say

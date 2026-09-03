## 0. The target, written first

- [x] 0.1 The e2e loop spec from `docs/06-testing-strategy.md` §7, written against the seeded Valle Verde fixture and left failing — see the gap → discuss → decide → find it again. It is the definition of done for this change, and "nearly there" stays visible rather than asserted
- [ ] 0.2 The Valle Verde seed (`docs/06` §8) — 27 members, Layer 0 complete, Layer 1 part-written, one open discussion, one adopted decision. Written after §1, since it needs the tables, but listed here because it is part of the target rather than of the schema

## 1. Schema

Names and columns from `docs/03-data-model.md` §3, which already specifies them.

- [x] 1.1 `definition` and `definition_version` as §3 gives them — including `attach_kind` with its two nullable keys, `open_proposal_id`, `provisional`, and the version's `n`, `supersedes_version_id`, `ai_assisted` and `linter_result`
- [x] 1.2 The three constraints, in the schema rather than in a service: the partial unique index on `(community_standard_id, section_key)`, `CHECK (scope='standard') = (section_key IS NOT NULL)`, and the check that exactly one `attach_*` is set when the scope is local
- [x] 1.3 `definition_draft` with `edit_token`, one live draft per definition
- [x] 1.4 `community_artifact`, and the *Community Agreements* row created with every community
- [x] 1.5 `clause_coverage`, unique on `(community_standard_id, clause_key)` — the one-owning-definition-per-clause rule made physical (§4)
- [x] 1.6 `discussion`, `post` (`kind message|proposal|offline_summary` with `proposal_version` — a proposal is a post, not a table), `objection`
- [x] 1.7 `consent_round`, `consent_eligible` (the snapshot written when a round opens), `consent_response` with `UNIQUE(round_id, membership_id)`
- [x] 1.8 `decision` with `UNIQUE(community_id, seq)` and `UNIQUE(community_id, idempotency_key)`, plus `decision_attendee`, `decision_clause` and `change_log`
- [x] 1.9 `notification` and `standard_feedback` (the table shape was missing from `docs/03` §3 and was added there during this review)
- [x] 1.10 Tests: migrations apply; the partial index permits many local definitions and exactly one standard definition per section; each CHECK refuses the shape it exists to refuse; a second response from one member replaces rather than duplicates; a duplicate idempotency key is refused by the database and not only by the service; coverage refuses two definitions for one clause

## 2. Definitions and drafts

- [x] 2.1 `services/definitions.ts` — create, read, list by artifact, with `Ctx` and no community id from input; registered in `services/registry.ts`
- [x] 2.2 Scope rules: a `local` definition may not name a section; a `standard` one must; the second definition for a section is refused and the existing one offered
- [x] 2.3 Draft autosave with `edit_token`, rotated on each save; a stale token refuses and returns who else is editing and what changed
- [x] 2.4 `standard_feedback` from the "RCOS should require this" checkbox, stored with the community's own text
- [x] 2.5 Markdown rendered server-side to a sanitised subtree; no component passes external text to a raw-HTML sink
- [x] 2.6 Tests: the `definitions` spec in full, including a local definition that names a section being refused, a stale token that does not overwrite, and the cross-tenant case the registry suite adds automatically
- [x] 2.7 Tests: `docs/06` §6.6 in full — a definition body, a post and a proposal each carrying `<img onerror>`, a `javascript:` URL and a Markdown image payload render inert, plus the grep test that no `{@html}` receives external data. This phase introduces the risk, so it carries the suite

## 3. Discussions, posts and proposals

- [x] 3.1 `services/discussions.ts` — open against a clause or a definition, post, list; registered
- [x] 3.2 Proposals as `post` rows with `kind = 'proposal'` and a `proposal_version` — distinct in the UI and in the data, without a second table that would have to be kept in step with the thread
- [x] 3.3 *Take offline*: mark decided offline with a summary and the proposal that came out of the room, reaching the same freeze
- [x] 3.4 Tests: the `discussions` spec in full — a member may propose and may not freeze; a freeze with no proposal is refused and says why; an offline decision records that it happened offline

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
- [ ] 5.7 `post.frozen_decision_id` set inside the transaction, so a proposal freezes once — the idempotency key stops one person submitting twice and cannot stop two people submitting once each
- [ ] 5.8 Supersession: a re-freeze marks the previous decision superseded and names its replacement, changing nothing about it otherwise
- [ ] 5.9 `decision_clause` storing standard, version and reference as quoted at decision time, alongside the stable clause key; `decision_attendee` with consent-to-publish captured at the freeze, because it cannot be collected retroactively in P6
- [ ] 5.10 Writes refused while the community is suspended, freezing included
- [ ] 5.11 Tests: the `decisions` spec in full — three consecutive numbers, a rolled-back freeze that consumes none, 23:59 on 31 December in a non-UTC community, a double submit producing one decision, and two stewards freezing at once producing one

## 6. Readiness and compliance

- [ ] 6.1 `services/readiness.ts` — readiness per layer and per community, counted over `clause_coverage`, memoised per request and never stored
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
- [ ] 10.3 Every service added in groups 2–7 is registered in `services/registry.ts`, so the parameterised cross-tenant suite covers it — a forgotten registration is the failure that suite exists to catch, and it fails the build rather than passing quietly
- [ ] 10.4 `docs/03-data-model.md`, `docs/06-testing-strategy.md` and the UI spec updated wherever the build taught us something the documents did not say

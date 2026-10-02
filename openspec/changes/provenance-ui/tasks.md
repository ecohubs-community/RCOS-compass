## 0. Exit spec first

- [ ] 0.1 Write the exit e2e as `fixme`, one flow: a member opens a definition and sees its decision, earlier versions and the thread it came from; opens its artifact and sees 5 of 8 with the blockers; asks for v3 back in a discussion; a steward grants it, sets a closing time and resolves an objection with a note; a member creates a local definition, discusses it and a steward freezes it. It goes green in 7.4

## 1. Schema and matrix

- [x] 1.1 Migration (additive only): `proposal_move_request` per design D10; `local_definition_touch(definition_id, clause_key)`; `community.interim_quorum_num`, `interim_quorum_den`, `interim_min_days` (nullable); `move_request` added to the post-kind enum. Check the generated SQL has no table rebuild
- [x] 1.2 `permissions.ts`: `proposal.request_move` for steward and member. Mirror it in `docs/04-security.md` §1, with the existing rows that now also gate new acts (`proposal.set_current` answers move requests; `consent.open` sets the closing time; `settings.manage` records the interim rule; `definition.draft` creates a local definition, as its "Create a local definition" row already says)
- [x] 1.3 Tests: a migration-upgrade test from the previous schema; the permission-matrix row for `proposal.request_move`, allowed and denied

## 2. Derived status and definition provenance reads

- [x] 2.1 `src/lib/shared/definition-status.ts`: pure `definitionStatus(facts, now)` per design D2
- [x] 2.2 `discussionsForDefinition(ctx, id)`: by `definitionId` or by `sectionOf(view, thread) = definition.sectionKey`, de-duplicated, with message counts (D1)
- [x] 2.3 `definitionVersions(ctx, id)`: every adopted version, newest first, with its decision ref and date; `decisionForVersion` by `decisionId`
- [x] 2.4 `relatedDefinitions(ctx, id)`: from `Clause.referencedBy` and annotation `dependsOn`, resolved to this community's definitions, unanswered ones as "not written yet"; for local definitions, from `local_definition_touch` (D3)
- [x] 2.5 `evidenceForDefinition(ctx, id)` in `evidence.ts` (no such read exists): confirmed, non-stale evidence for the clauses the definition's section owns
- [x] 2.6 Replace the Standard browser's three-way status with `definitionStatus`
- [x] 2.7 Tests: `definitionStatus` exhaustively, one case per state and the adopted-but-rediscussed case; each read's happy path plus cross-tenant isolation (another community with the same clause key); the discussion read by `definitionId`, by a clause, by a section-only thread from the Path, by both at once, and not for a thread on a clause this section only references; a definition with no adopted version

## 3. Definition page

- [x] 3.1 Header: layer and artifact breadcrumb, obligation chip, derived-status chip, provisional chip, beside the existing `<CitedClauses>`; *Start discussion* (posting `definitionId` when none is open) / *Propose change* per D13; *Version history* anchors to the list. The requirement column and "What to cover" stay as built
- [x] 3.2 "How we got here" column, in this order: discussions (count and messages), open proposal, decision block (ref linking to the register, mechanism, tally, decided, review due, provisional), earlier versions, related definitions, evidence. The "no decision yet" state per spec
- [x] 3.3 On a phone, the column is the "How we got here" tab (docs/02 §7 triad already built); check it at 375px
- [x] 3.4 Move the page's hard-coded English into Paraglide messages as the page is touched; the i18n baseline must go down
- [x] 3.5 Tests: e2e on an adopted definition (decision, versions, a thread opened on the clause) and on a drafting one; accessibility scan of the page; the actions follow `can.*` props, never role checks

## 4. Artifact detail

- [x] 4.1 `artifactDetail(ctx, key)` in a new `artifacts.ts`: required sections in standard order with answering definition, status and provisional; local additions apart; counts from `progressOf` so they equal the list's (D4); blockers per D6, the restricted ones from `restrictedInClosedLayers`
- [x] 4.2 `allocateRef(tx, ctx, now)` in `decisions.ts`, replacing the freeze's inline allocation; `publishArtifact` / `withdrawArtifact` publish an RCOS artifact's adopted definitions and write one decision, idempotently, used by the settings page and the artifact page; a community artifact's publish writes one too (D5); `publicationHistory(ctx, key)` from the `artifact.*` change-log entries
- [x] 4.3 Route `/c/[slug]/artifacts/[key]`: sections table (cards below 768px), local additions block, segmented completeness with counts and percentage of sections (D4), blockers linking to their work, publication state and history, *Publish* for `artifact.publish`. The Artifacts list's "Open" links here
- [x] 4.3a Artifacts list: each row adds "n of m sections · p%" beside its state; the comment that refused a percentage is replaced with D4's reasoning
- [x] 4.4 Tests: service happy path; unknown key and another community's key both 404; a local addition does not change the count; the count equals `artifactProgress` for the same artifact; a restricted Layer 0 definition is a blocker and a restricted Layer 3 one under a live exception is not; a member's direct publish is refused; publishing writes a decision with the next gapless reference and withdrawing another, re-publishing a published artifact writes none, a failed publish allocates no reference; the existing freeze tests pass unchanged after `allocateRef`; the Artifacts list shows the percentage of sections; e2e asserts no "% compliant" on the page or the list, no `%` on the public artifact page, and that publish from the page adds a history entry linking to its decision

## 5. Consent round view

- [ ] 5.1 `setRoundClosing(ctx, {discussionId, closesAt})` behind `consent.open`: opens the round on the current version through `createRound` if needed, refuses a past time, writes an `event` post (D7)
- [ ] 5.2 Interim rule: service to read and record it behind `settings.manage`; a new `settings/adoption-rule` page linked from the settings layout
- [ ] 5.3 `passChecklist(ctx, roundId)`: responded of eligible, open objections, days open, and each against the rule when one exists. It is computed from the same tally the rail shows
- [ ] 5.4 Objections: the load adds `raisedBy` (tombstone-aware) and `raisedAt`; *Resolve* moves from `can.freeze` to `can.resolveObjection` (`objection.resolve`) and the action passes the note, which `resolveObjection` now requires for addressed and overruled; *Withdraw* for the objector (`state: 'withdrawn'`, already raiser-only); *Reply in thread* anchors to the reason post; *Amend* opens the new-version form prefilled with the objection referenced (D9)
- [ ] 5.5 Rail: closing time through `useTime().deadline` (viewer's zone, named) and days left; the checklist; the same checklist on the freeze form, which stays available (D8)
- [ ] 5.6 Tests: steward sets, changes, refused in the past, member refused; the round opens with eligibility when a time is set first; the reminder job picks a round with a closing time; resolution needs a note, a member resolving someone else's objection is refused, the objector withdraws; the checklist equals the tally after a changed response, with a rule and without; **a freeze succeeds with every line unmet**; e2e of the round view without JavaScript

## 6. Move requests

- [ ] 6.1 `requestMove(ctx, {discussionId, targetProposalPostId, reason})` behind `proposal.request_move`: refuses the current version and a second open request; writes the post and the record in one transaction
- [ ] 6.2 `answerMove(ctx, {requestId, grant, note?})` behind `proposal.set_current`: grant calls `setCurrentProposal` in the same transaction; decline needs a note. `withdrawMove` for the requester
- [ ] 6.3 `setCurrentProposal` and posting a new version settle open requests: granted-by-event or lapsed (D10)
- [ ] 6.4 Notifications: `activeStewards(db, communityId)` beside `activeMemberships`; a kind for stewards on a request and one for the requester on its outcome, each in `kinds.ts`, `text.ts`, the three locales' messages and `jobs/notification-mail.ts`
- [ ] 6.5 Thread UI: the `move_request` post renders who asked for which version and why, its state, and the steward's *Put vN back* / *Decline* and the requester's *Withdraw*. The "ask" control sits beside each earlier version in the rail
- [ ] 6.6 Tests: each refusal; grant moves the question and reopens the superseded round exactly as `setCurrentProposal` does; decline without a note refused; member grant refused; cross-tenant 404; settled by a direct move and lapsed by a new version; stewards notified except the requester, former stewards not, requester told the outcome; e2e ask → grant

## 7. Definitions index and local definitions

- [ ] 7.1 `listDefinitions(ctx, filters)`: every definition the reader may see (`visibleTo`, D14) with artifact, ref, version, derived status, provisional, last changed and by whom, in a fixed number of queries; filters by status, artifact, needs-my-attention (D12) and provisional
- [ ] 7.2 Route `/c/[slug]/definitions` with filters and cards below 768px; nav gets "Standard" and "Definitions" back as two entries (D12), `nav_standard` copy updated
- [ ] 7.3 Local definitions: *New definition* form (title, layer required, purpose, optional artifact, touched clauses and "RCOS should require this", which `createDefinition` already records as feedback) behind `definition.draft`; the discussions `open` action accepts a `definitionId`; the local detail page shows "Why we made this rule" (purpose and the adopted definitions in its layer), who asked for it, when v1 was adopted, "Touches … satisfies neither" and the public-index note (D11). `resolveDefinition` is not changed
- [ ] 7.4 Tests: a local definition marked "RCOS should require this" appears on the feedback page (#3); a restricted definition is hidden from a member's index, artifact page and related list and shown to a steward (D14); the index filters, needs-my-attention for an unanswered member vs an answered one; cross-tenant isolation; create refused without a layer and in a suspended community; a local definition moves no number; open-on-definition refused for another community's definition; freezing a local discussion versions that definition while the existing clause-path freeze tests pass unchanged; the exit spec from 0.1 goes green

## 8. Docs and close-out

- [ ] 8.1 `docs/03`: §5 round closing (no longer "when everyone eligible has responded"), §3a the new tables and columns, §3a.1 matches the local page as built
- [ ] 8.2 `docs/08`: note the provenance UI under the phase that ships it
- [ ] 8.3 Bump the version per AGENTS.md: a minor, `0.11.0 → 0.12.0`
- [ ] 8.4 `openspec validate provenance-ui`, then archive on ship

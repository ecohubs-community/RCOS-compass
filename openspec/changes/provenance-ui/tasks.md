## 0. Exit spec first

- [ ] 0.1 Write the exit e2e as `fixme`, one flow: a member opens a definition and sees its decision, earlier versions and the thread it came from; opens its artifact and sees 5 of 8 with the blockers; asks for v3 back in a discussion; a steward grants it, sets a closing time and resolves an objection with a note; a member creates a local definition, discusses it and a steward freezes it. It goes green in 7.4

## 1. Schema and matrix

- [ ] 1.1 Migration (additive only): `proposal_move_request` per design D10; `local_definition_touch(definition_id, clause_key)`; `community.interim_quorum_num`, `interim_quorum_den`, `interim_min_days` (nullable); `move_request` added to the post-kind enum. Check the generated SQL has no table rebuild
- [ ] 1.2 `permissions.ts`: `proposal.request_move` and `definition.create_local` for steward and member. Mirror both in `docs/04-security.md` §1, with the existing rows that now also gate new acts (`proposal.set_current` answers move requests; `consent.open` sets closing time; `settings.manage` records the interim rule)
- [ ] 1.3 Tests: a migration-upgrade test from the previous schema; permission-matrix rows for both new capabilities, allowed and denied

## 2. Derived status and definition provenance reads

- [ ] 2.1 `src/lib/definitions/status.ts`: pure `definitionStatus(facts, now)` per design D2
- [ ] 2.2 `discussionsForDefinition(ctx, id)`: by `definitionId` or by a clause the definition's section owns, de-duplicated, with message counts (D1)
- [ ] 2.3 `definitionVersions(ctx, id)`: every adopted version, newest first, with its decision ref and date; `decisionForVersion` by `decisionId`
- [ ] 2.4 `relatedDefinitions(ctx, id)`: from `Clause.referencedBy` and annotation `dependsOn`, resolved to this community's definitions, unanswered ones as "not written yet"; for local definitions, from `local_definition_touch` (D3)
- [ ] 2.5 `evidenceForDefinition(ctx, id)`: confirmed evidence for the clauses the definition answers
- [ ] 2.6 Replace the Standard browser's three-way status with `definitionStatus`
- [ ] 2.7 Tests: `definitionStatus` exhaustively, one case per state and the adopted-but-rediscussed case; each read's happy path plus cross-tenant isolation (another community with the same clause key); the discussion read by each path and by both at once; a definition with no adopted version

## 3. Definition page

- [ ] 3.1 Header: layer and artifact breadcrumb, obligation chip, derived-status chip, provisional chip; *Start discussion* / *Propose change* per D13; *Version history* anchors to the list
- [ ] 3.2 "How we got here" column, in this order: discussions (count and messages), open proposal, decision block (ref linking to the register, mechanism, tally, decided, review due, provisional), earlier versions, related definitions, evidence. The "no decision yet" state per spec
- [ ] 3.3 On a phone, the column is the "How we got here" tab (docs/02 §7 triad already built); check it at 375px
- [ ] 3.4 Move the page's hard-coded English into Paraglide messages as the page is touched; the i18n baseline must go down
- [ ] 3.5 Tests: e2e on an adopted definition (decision, versions, a thread opened on the clause) and on a drafting one; accessibility scan of the page; the actions follow `can.*` props, never role checks

## 4. Artifact detail

- [ ] 4.1 `artifactDetail(ctx, key)`: required sections in standard order with answering definition, status and provisional; local additions apart; counts from `progressOf` so they equal the list's (D4); blockers per D6
- [ ] 4.2 `publicationHistory(ctx, key)` from `change_log`; `publishArtifact(ctx, key)` as `publishAll` with one subject (D5)
- [ ] 4.3 Route `/c/[slug]/artifacts/[key]`: sections table (cards below 768px), local additions block, segmented completeness with counts, blockers linking to their work, publication state and history, *Publish* for `artifact.publish`. The Artifacts list's "Open" links here
- [ ] 4.4 Tests: service happy path; unknown key and another community's key both 404; a local addition does not change the count; the count equals `artifactProgress` for the same artifact; a member's direct publish is refused; e2e asserts no `%` on the page (as `artifacts.spec.ts` does for the list) and that publish from the page writes a history entry

## 5. Consent round view

- [ ] 5.1 `setRoundClosing(ctx, {discussionId, closesAt})` behind `consent.open`: opens the round on the current version if needed, refuses a past time, writes a thread post (D7)
- [ ] 5.2 Interim rule: service to read and record it behind `settings.manage`; form on the settings page
- [ ] 5.3 `passChecklist(ctx, roundId)`: responded of eligible, open objections, days open, and each against the rule when one exists. It is computed from the same tally the rail shows
- [ ] 5.4 Objections: the load adds `raisedBy` (tombstone-aware) and `raisedAt`; *Resolve* moves from `can.freeze` to `objection.resolve` with a required note; *Withdraw* for the objector; *Reply in thread* anchors to the reason post; *Amend* opens the new-version form prefilled with the objection referenced (D9)
- [ ] 5.5 Rail: closing time and days left in the community's time zone; the checklist; the same checklist on the freeze form, which stays available (D8)
- [ ] 5.6 Tests: steward sets, changes, refused in the past, member refused; the round opens with eligibility when a time is set first; the reminder job picks a round with a closing time; resolution needs a note, a member resolving someone else's objection is refused, the objector withdraws; the checklist equals the tally after a changed response, with a rule and without; **a freeze succeeds with every line unmet**; e2e of the round view without JavaScript

## 6. Move requests

- [ ] 6.1 `requestMove(ctx, {discussionId, targetProposalPostId, reason})` behind `proposal.request_move`: refuses the current version and a second open request; writes the post and the record in one transaction
- [ ] 6.2 `answerMove(ctx, {requestId, grant, note?})` behind `proposal.set_current`: grant calls `setCurrentProposal` in the same transaction; decline needs a note. `withdrawMove` for the requester
- [ ] 6.3 `setCurrentProposal` and posting a new version settle open requests: granted-by-event or lapsed (D10)
- [ ] 6.4 Notifications: a new kind for stewards on a request, one for the requester on its outcome, with messages in `kinds.ts` and all three locales' keys
- [ ] 6.5 Thread UI: the `move_request` post renders who asked for which version and why, its state, and the steward's *Put vN back* / *Decline* and the requester's *Withdraw*. The "ask" control sits beside each earlier version in the rail
- [ ] 6.6 Tests: each refusal; grant moves the question and reopens the superseded round exactly as `setCurrentProposal` does; decline without a note refused; member grant refused; cross-tenant 404; settled by a direct move and lapsed by a new version; stewards notified except the requester, former stewards not, requester told the outcome; e2e ask → grant

## 7. Definitions index and local definitions

- [ ] 7.1 `listDefinitions(ctx, filters)`: every definition with artifact, ref, version, derived status, provisional, last changed and by whom; filters by status, artifact, needs-my-attention (D12) and provisional
- [ ] 7.2 Route `/c/[slug]/definitions` with filters and cards below 768px; nav gets "Standard" and "Definitions" back as two entries (D12), `nav_standard` copy updated
- [ ] 7.3 Local definitions: *New definition* form (title, layer required, purpose, optional artifact and touched clauses) behind `definition.create_local`; discussions `open` accepts a definition; `resolveDefinition` freezes a discussion opened on a definition into a new version of it; the local detail page shows "Why we made this rule", who asked for it, when v1 was adopted, "Touches … satisfies neither" and the public-index note (D11)
- [ ] 7.4 Tests: the index filters, needs-my-attention for an unanswered member vs an answered one; cross-tenant isolation; create refused without a layer and in a suspended community; a local definition moves no number; open-on-definition refused for another community's definition; freezing a local discussion versions that definition while the existing clause-path freeze tests pass unchanged; the exit spec from 0.1 goes green

## 8. Docs and close-out

- [ ] 8.1 `docs/03`: §5 round closing (no longer "when everyone eligible has responded"), §3a the new tables and columns, §3a.1 matches the local page as built
- [ ] 8.2 `docs/08`: note the provenance UI under the phase that ships it
- [ ] 8.3 Bump the version per AGENTS.md: a minor
- [ ] 8.4 `openspec validate provenance-ui`, then archive on ship

## 9. Open questions for a human

- [ ] 9.1 Percentage on the artifact list and detail (design D4, open question 1)
- [ ] 9.2 May a proposal's author resolve objections to it? (open question 2)
- [ ] 9.3 May a declined move request be asked again without a new version in between? (open question 3)
- [ ] 9.4 Confirm "publishing writes a decision" is its own next change (open question 4)

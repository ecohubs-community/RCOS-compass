## 1. Schema and migration

- [x] 1.1 Add `discussion.current_proposal_post_id` as a nullable text column with **no** `.references()`, beside `frozen_decision_id` and for the same reason — `post.discussion_id` already cascades from `discussion`, so a constraint pointing back is a cycle
- [x] 1.2 Generate the drizzle migration, with the backfill setting each discussion's column to the `post.id` of its highest `proposal_version` and leaving it null where a thread has no proposal
- [x] 1.3 Test the migration against a fixture holding a thread with three versions, a thread with one, and a thread with none — asserting the backfill reproduces today's "newest answers" behaviour exactly

## 2. The column becomes the question

- [x] 2.1 Set the column in `writeProposal`, inside the transaction that already closes the previous round, so the two cannot disagree
- [x] 2.2 Change `respondableProposal` in `voting/consent-round.ts` to compare against `discussion.current_proposal_post_id` rather than against `max(proposalVersion)`, keeping the refusal and its message
- [x] 2.3 Change `proposalToFreeze`'s fallback from `latestProposal` to the current version — a form carrying no version id would otherwise record v4's words under the tally v3 was given, which is the failure that function was rewritten to prevent
- [x] 2.4 Change the rail's `load` default from `proposals.at(-1)` to the current version, so the panel and the response form never disagree about which version is being asked about
- [x] 2.5 Leave the readers that genuinely mean *newest* alone, and say so in a comment where it is not obvious: `laterVersion` and the "v4 is the text on the table" line warn a reader that something newer exists, and `listDiscussionSummaries.version` prints the row's version number
- [x] 2.6 Tests: posting v4 makes v4 current; a response to v3 is refused while v4 is current; a response to v3 is recorded when v3 is current and v4 exists; a freeze naming no version records the current one; the rail with no `?v=` opens on the current version; a thread with no proposal names no version

## 3. Moving the question back

- [x] 3.1 Add `proposal.set_current` to `CAPABILITIES` in `src/lib/server/auth/permissions.ts`, in the "Recording — authority" block, held by `steward` only — and to the matrix in `docs/04-security.md` §1
- [x] 3.2 Write `setCurrentProposal(ctx, { discussionId, proposalPostId, reason? })` in `services/discussions.ts`, refusing a target that is not a proposal in that discussion and returning early when it is already current
- [x] 3.3 In the same transaction: close any open round on the version that was current as `superseded`, and reopen the target's round when it is superseded, its deadline is absent or still ahead, and at least one eligible member has not answered
- [x] 3.4 Refuse the reopen otherwise, with a message saying the question can only be asked again as a new round — a round `closeIfDue` would close on the next read must not be reopened into a state that lasts until somebody looks at the page
- [x] 3.5 Reopen without touching `consent_eligible` — the denominator a community was given is the one it is held to
- [x] 3.6 Send `consent.opened` to the eligible members who have not answered, and to nobody else; notify nobody about the round that closed
- [x] 3.7 Write the move as a post in the thread, attributed, naming the version it moved from and to and carrying the reason where one was given — `writeThreadPost` notifies nobody, which is why 3.6 is its own step
- [x] 3.8 Keep this out of `VotingProvider` — and out of `voting/consent-round` entirely: the seam test in `tests/integration/consent.test.ts` forbids any service importing the built-in provider, so the reopen helpers live beside `writeProposal`'s existing direct `consent_round` update rather than in the voting module
- [x] 3.9 Tests: a steward moves the question and the round comes back with its responses and its original eligibility; a member who joined in the meantime is not eligible; the round that was current closes as superseded and keeps its responses; a deadline-closed round stays closed; a superseded round whose deadline has since passed is refused and the current round survives; a superseded round everybody answered is refused; a version with no round stays roundless and the next response opens one; the right members are notified and the ones who answered are not; a member is refused; a cross-tenant target is 404; a non-proposal target is refused; moving to the already-current version writes no post and notifies nobody; a failure mid-move leaves the question where it was

## 4. Permission-matrix row

- [x] 4.1 Add the `proposal.set_current` expectation to `tests/unit/permissions.test.ts` — it asserts one entry per capability and fails the build without one, so this lands in the same commit as 3.1
- [x] 4.2 Register `setCurrentProposal` with the tenant-service registry so the cross-tenant suite covers it

## 5. The rail

- [x] 5.1 Carry the current version's id through `load` and mark it in the version list, distinct from frozen and from superseded
- [x] 5.2 Show the response form on the current version rather than on the newest, and reword the "v4 is the text on the table" line, which now states something that may not be true
- [x] 5.3 Offer "put this version back on the table" on a version that is not current, to a steward, with an optional reason — and nowhere else
- [x] 5.4 Give the act a confirmation that says what it will do to the round that is open, because closing somebody's live round is not obvious from the button
- [x] 5.5 Say plainly when the move is refused — a lapsed deadline or a round already answered — rather than leaving the button to do nothing
- [x] 5.6 Check the control, its confirmation and its refusal at 375px, and that the version list still reads when one version is the question and another is frozen

## 6. Proof

- [x] 6.1 E2E in `tests/e2e/discussion-rail.spec.ts`: consent to v3 with two of three members, post v4, put v3 back, the third member answers v3, freeze v3 on the full tally — the journey this change exists for
- [x] 6.2 E2E: the same screen with JavaScript disabled, since moving the question is a form like every other act here
- [x] 6.3 Accessibility scan of the rail with the control present
- [x] 6.4 Update `docs/03-data-model.md` §3 with the column and what it means, and `docs/04-security.md` §1 with the new row

## 7. Open questions for a human

- [ ] 7.1 Should a member be able to *ask* for the question to be moved back, as a thread act, rather than having to raise it in prose? Out of scope here, but it is the obvious next thing a community will want.
- [ ] 7.2 When v3 is put back and later frozen, should the register record that the question moved? The decision quotes a tally; the tally is now the product of a round that stopped and restarted, and a reader in three years may want to know that. Recommendation: no extra field — the thread carries the post, and the change log already points at the thread.

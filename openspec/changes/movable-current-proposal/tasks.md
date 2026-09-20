## 1. Schema and migration

- [ ] 1.1 Add `discussion.current_proposal_post_id`, nullable, referencing `post` on delete set null, in `schema/discussions.ts`
- [ ] 1.2 Generate the drizzle migration, with the backfill setting each discussion's column to the `post.id` of its highest `proposal_version` and leaving it null where a thread has no proposal
- [ ] 1.3 Test the migration against a fixture holding a thread with three versions, a thread with one, and a thread with none — asserting the backfill reproduces today's "newest answers" behaviour exactly

## 2. The column becomes the question

- [ ] 2.1 Set the column in `writeProposal`, inside the transaction that already closes the previous round, so the two cannot disagree
- [ ] 2.2 Change `respondableProposal` in `voting/consent-round.ts` to compare against `discussion.current_proposal_post_id` rather than against `max(proposalVersion)`, keeping the refusal and its message
- [ ] 2.3 Check every other place that reasons about "the latest version" and decide, per call site, whether it means *newest* or *the question*: `proposal.isLatest` in the rail's `load`, `laterVersion`, the "takes no more responses" line, and `listDiscussionSummaries`' `inVote`/`waitingOnMe`
- [ ] 2.4 Tests: posting v4 makes v4 current; a response to v3 is refused while v4 is current; a response to v3 is recorded when v3 is current and v4 exists; a thread with no proposal names no version

## 3. Moving the question back

- [ ] 3.1 Add `proposal.set_current` to the permission matrix in `docs/04-security.md` §1 and to the matrix in code, held by `steward` and not by `member`
- [ ] 3.2 Write `setCurrentProposal(ctx, { discussionId, proposalPostId, reason? })` in `services/discussions.ts`, refusing a target that is not a proposal in that discussion and returning early when it is already current
- [ ] 3.3 In the same transaction: close any open round on the version that was current as `superseded`, and reopen the target's round when — and only when — it was closed as `superseded`
- [ ] 3.4 Leave a round closed by its deadline closed, and a round every eligible member answered closed; neither reopens
- [ ] 3.5 Reopen without touching `consent_eligible` — the denominator a community was given is the one it is held to
- [ ] 3.6 Write the move as a post in the thread, attributed, naming the version it moved from and to and carrying the reason where one was given
- [ ] 3.7 Tests: a steward moves the question and the round comes back with its responses and its original eligibility; a member who joined in the meantime is not eligible; the round that was current closes as superseded and keeps its responses; a deadline-closed round stays closed; a version with no round stays roundless and the next response opens one; a member is refused; a cross-tenant target is 404; a non-proposal target is refused; moving to the already-current version writes no post; a failure mid-move leaves the question where it was

## 4. Permission-matrix row

- [ ] 4.1 Add the `proposal.set_current` row to `tests/unit/permissions.test.ts`, asserting steward yes and member no — the matrix test is the only place a capability is proved to be guarded
- [ ] 4.2 Register `setCurrentProposal` with the tenant-service registry so the cross-tenant suite covers it

## 5. The rail

- [ ] 5.1 Carry the current version's id through `load` and mark it in the version list, distinct from frozen and from superseded
- [ ] 5.2 Show the response form on the current version rather than on the newest, and reword the "v4 is the text on the table" line, which now states something that may not be true
- [ ] 5.3 Offer "put this version back on the table" on a version that is not current, to a steward, with an optional reason — and nowhere else
- [ ] 5.4 Give the act a confirmation that says what it will do to the round that is open, because closing somebody's live round is not obvious from the button
- [ ] 5.5 Check the control and its confirmation at 375px, and that the version list still reads when one version is the question and another is frozen

## 6. Proof

- [ ] 6.1 E2E in `tests/e2e/discussion-rail.spec.ts`: consent to v3 with two of three members, post v4, put v3 back, the third member answers v3, freeze v3 on the full tally — the journey this change exists for
- [ ] 6.2 E2E: the same screen with JavaScript disabled, since moving the question is a form like every other act here
- [ ] 6.3 Accessibility scan of the rail with the control present
- [ ] 6.4 Update `docs/03-data-model.md` §3 with the column and what it means, and `docs/04-security.md` §1 with the new row

## 7. Open questions for a human

- [ ] 7.1 Should moving the question notify the eligible members? Their live round just closed, or reopened, and the notification vocabulary has no word for it. Silence is the safe default and may be the wrong one.
- [ ] 7.2 Should a member be able to *ask* for the question to be moved back, as a thread act, rather than having to raise it in prose? Out of scope here, but it is the obvious next thing a community will want.
- [ ] 7.3 When v3 is put back and later frozen, should the register record that the question moved? The decision quotes a tally; the tally is now the product of a round that stopped and restarted, and a reader in three years may want to know that.

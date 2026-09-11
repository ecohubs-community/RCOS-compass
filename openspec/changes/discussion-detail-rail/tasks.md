## 1. Schema and migration

- [x] 1.1 Make `consent_round.closes_at` nullable in `schema/discussions.ts`
- [x] 1.2 Add `superseded` to `consent_round.status` and a `superseded_by_post_id` column
- [x] 1.3 Add `consent_response.reason_post_id` referencing `post`, on delete set null, alongside the existing `objection_id`
- [x] 1.4 Add `post.revision_note`
- [x] 1.5 Generate the drizzle migration and add the one-off step closing rounds that are `open` on a version a later version superseded, setting `superseded_by_post_id` to the next version in the thread
- [x] 1.6 Test the migration against a fixture holding an orphaned open round, asserting it closes as superseded and its responses survive

## 2. The round opens on the first response

- [x] 2.1 In `voting/consent-round.ts`, split the round-creating body out of `openRound` so it can be called without the `consent.open` permission check
- [x] 2.2 Make `respond` open a round when none exists on the proposal, in its own transaction, leaving `opened_by` and `closes_at` null
- [x] 2.3 Make `respond` and the tally tolerate a null `closes_at`; keep the future-deadline guard only for rounds that carry one
- [x] 2.4 Close a round when its last eligible member responds, deadline or not
- [x] 2.5 Decide and implement what the lazy open notifies — `consent.opened` today tells every eligible member a round is open, and that notification would now fire on somebody's first response, which is a different sentence; `tests/integration/notifications.test.ts:134` asserts the current one
- [x] 2.6 Keep `consent.open` guarding `openRound` — it is not unused, so removing it would mean guarding a real steward act with a borrowed permission
- [x] 2.7 Delete the `openRound` action from the discussion route, keeping `openRound` on the `VotingProvider` interface — the spec requires a round to be reachable through the provider, and a second provider will still need to open one
- [x] 2.8 Tests: a plain member's first response opens a round and records the response; a failure records neither; a second response joins the existing round; a member joining between the proposal and the first response is eligible; a member joining after is not; a cross-tenant response opens no round and notifies nobody; `openRound` still refuses a plain member

## 3. A new version supersedes the previous round

- [x] 3.1 Factor `addProposal` so its body takes a `tx`, matching how `takeOffline` threads one
- [x] 3.2 Wrap `addProposal` in a transaction that closes any open round on the previous version as `superseded`, recording the new version
- [x] 3.3 Stop `openRoundFor` reporting a superseded round as open, and refuse a response to a superseded version
- [x] 3.4 Keep the superseded round's tally reachable by version, so the rail can say what was not carried and a freeze of that version can still be pre-filled from it
- [x] 3.5 Tests: posting v4 closes v3's round and keeps its responses against v3; v4 starts with no round; a response to a superseded version is refused; freezing v3 pre-fills from v3's superseded round and not from v4's; freezing v4 pre-fills from v4's round and v3's contributes nothing; a failed version write leaves the previous round open

## 4. A reason is a post

- [x] 4.1 Give `respond` an optional `reason` for all three values, writing it as a post in the thread attributed to the responder and linking it from `reason_post_id`
- [x] 4.2 Keep `objection.reason` required and write its post alongside, so an objection has both
- [x] 4.3 Leave the earlier reason post in place when a member changes their response
- [x] 4.4 Retire the route's free-standing `object` action and `objections.raiseObjection` as a public entry point — objecting is now responding with `objection`, and two doors onto one record is how the two drift apart
- [x] 4.5 Tests: objecting through the retired action is no longer reachable; consent with a reason writes a post; abstain with a reason writes a post; consent without one writes none; an objection without a reason is refused; changing from objection to consent withdraws the objection and leaves its post; a cross-tenant response writes no post

## 5. Authorship, revision notes and the thread

- [x] 5.1 Resolve a post's author to a label — joining the author's user to their membership in this community for the `seq` that `personLabel` needs — and carry it through `load` with initials for the avatar
- [x] 5.2 Accept an optional `revisionNote` on `addProposal` and expose it with the version number
- [x] 5.3 Build the thread entries the screen needs: message, reason post, revision event, offline summary
- [x] 5.4 Add the version comparison view reached from a revision event
- [x] 5.5 Tests: a thread names its authors; an erased author renders as the former-member label and their name appears nowhere in the payload; a display name wins over an account name; an author whose membership has ended still resolves to a label; a revision with a note shows it; a revision without one still shows the event; v1 shows no revision event

## 6. The vote block

- [x] 6.1 Build the collapsible block as a `<details>` keyed by round, placed at the round's opening — which is by construction the first response to that version — summarising collapsed and listing value, responder, reason and time expanded
- [x] 6.2 Point every count in the rail at the block as a fragment link
- [x] 6.3 Tests: the block appears at the first response and later responses join it rather than making a second; expanding lists every response; an erased responder is still listed and counted under the former-member label; the block renders and expands with JavaScript disabled

## 7. A thread survives its decisions

- [x] 7.1 Stop `requireWritable` treating `frozen` as terminal, leaving `abandoned` as the only status that ends a thread
- [x] 7.2 Return the thread's status to open when a new version is posted after a freeze, and make `discussion.frozenDecisionId` mean the most recent decision the thread produced
- [x] 7.3 Move the frozen-once guard so it is asserted on the proposal rather than inherited from the thread's status
- [x] 7.4 Replace the "This discussion has been decided. Start a new one to change it." message with one naming the decision in force
- [x] 7.5 No change needed — `services/path.ts` already counts only `status = 'open'` threads, and returning a thread to open when a new version lands makes that filter correct in both directions
- [x] 7.6 Populate `definition.openProposalId` when a version is posted, or delete the column — it is documented as "the proposal currently in flight" and is only ever written as null, which was harmless while a freeze ended the thread and is not once v5 can follow v3
- [x] 7.7 Tests: a reply after a freeze is accepted; a new version after a freeze becomes the one on the table; freezing v5 creates a second decision and supersedes the one that adopted v3, whose reference, text and tally are unchanged; refreezing v3 is refused naming its decision; a post to an abandoned thread is refused; a post in a suspended community is refused; a decided thread with no newer version is not counted as stalled

## 8. Version selection

- [x] 8.1 Resolve a selected version in `load` from the query string, falling back to the latest for an absent, unknown or foreign value
- [x] 8.2 Make the rail's text, responses, linter and freeze all read the selected version and nothing else
- [x] 8.3 Render the version buttons as links carrying the selection, so the rail works with no JavaScript
- [x] 8.4 Derive each version's frozen state by joining `post.frozenDecisionId` to its decision's status, and render never frozen, frozen and in force, and frozen and superseded distinctly
- [x] 8.5 Tests: selecting v2 in a thread at v4 shows v2's text, responses and linter and counts none of v4's; a link naming v2 opens on v2; no version named selects the latest; a version that does not exist falls back to the latest rather than erroring; a proposal from another discussion is not shown; the three frozen states render from the decision's status; a thread with no proposal selects nothing and offers writing one

## 9. The two-pane screen

- [x] 9.1 Give `(app)/c/[slug]/+layout.svelte` an explicit full-height mode a page can request, replacing the single scrolling column for pages that ask
- [x] 9.2 Build the left pane: scrolling thread with the composer pinned beneath it, switching between Reply, Revise the proposal and Write up a meeting
- [x] 9.3 Make Revise open the selected version's text and submit as a new version; make Reply never touch a version
- [x] 9.4 Build the rail: version buttons, the proposal text, Revise and Compare, the responses card with all three buttons and the optional reason field, the linter card rendering today's flat findings, and the freeze footer
- [x] 9.5 Show each response row's people as up to three initial-avatars plus a `+N`, with initials taken from `personLabel` so an erased member's avatar carries their former-member label
- [x] 9.6 Build the rail's empty state for a thread with no proposal, per screen 06c
- [x] 9.7 Stack the panes at 375px with the rail above the composer
- [x] 9.8 Tests: a response row of six people shows three avatars and `+3`; a row of two shows two avatars and no `+N`; an erased responder's avatar carries their former-member initials and their name appears nowhere; the row's width does not change between three responses and nineteen; replying leaves the version unchanged; revising produces a new version from the selected version's text; a member who may not propose is not offered Revise and is refused if they submit one; the empty rail offers writing a proposal; the screen has no horizontal scroll at 375px

## 10. The freeze

- [x] 10.1 Change `proposalToFreeze` to take the proposal to freeze, validating that it belongs to this discussion and is not already frozen, and post `proposalPostId` from the form
- [x] 10.2 Name the version and its date on the form, and say when the selected version is not the latest, naming the later one
- [x] 10.3 Wire `reviewDueAt` and `attendees` from the form to the service, pre-filled from the selected version's round and editable
- [x] 10.4 State the unresolved-objection count and its consequence on the form before submission
- [x] 10.5 Tests: a freeze opened on v3 and submitted after v4 lands still adopts v3, leaving v4 freezable; freezing v3 while v4 exists is permitted and the form named v4 first; a proposal from another discussion is refused; a proposal from another community answers as not found; a member submitting the form is refused; a review date is recorded and its absence is not an error; attendees pre-fill from the selected version's round and survive editing; an attendee without consent is stored and counted; the form states the objection count and still permits the freeze

## 11. Close out

- [x] 11.1 Update `tests/integration/discussions.test.ts` and the consent suite for the removed steward-opens-a-round flow and the non-terminal freeze
- [x] 11.2 Run the accessibility checks on the two-pane screen, the version buttons and the vote block — found and fixed two real violations: `text-fg-muted` on `bg-raised` is 4.33:1 (below AA), and the two scrolling panes had no keyboard access
- [x] 11.3 `openspec validate discussion-detail-rail --strict`

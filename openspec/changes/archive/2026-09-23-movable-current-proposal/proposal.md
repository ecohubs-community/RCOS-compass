## Why

A community can **freeze** v3 while v4 is on the table. It cannot **finish
asking** about v3.

`discussion-detail-rail` deliberately made an earlier version freezable — "a
community can vote v3 through, watch v4 draw objections, and record v3" — and at
the same time made the newest version the only one that takes responses. Both
halves are right on their own and together they leave a gap with no way out:

> Nine of twenty-seven have consented to v3. Someone posts v4. The other
> eighteen can never answer v3 again. The steward's choices are to freeze v3 on
> a 9-of-27 tally the community never finished giving, or to abandon a text
> everybody was agreeing to.

The refusal is `respondableProposal` in `voting/consent-round.ts`, and its
reason is good: *"a vote arriving on v3 afterwards would be counted into a tally
that a freeze of v3 might later quote."* A consent gathered after the
conversation moved on must not be quoted into the register as part of a round
that had already stopped. That reason survives this change intact.

What is wrong is not the rule but the thing it is attached to. "The current
version" is computed as `max(proposalVersion)`, so writing v4 is the only event
in the system that can move the question — and it is irreversible. Nobody can
say *"v4 is a sketch, we are still deciding v3"*, because the product has no way
to express it.

Reasoning: `UI Spec — v0.1 (draft).md` §5.1, `docs/03-data-model.md` §3,
`docs/04-security.md` §1 (members propose; stewards record),
`openspec/specs/consent/spec.md` ("A new version closes the previous version's
round and does not carry its responses").

## What Changes

- **A discussion names the version it is currently asking about**, in a column,
  instead of the newest version being it by definition. `discussion.current_proposal_post_id`.
- **Posting a version moves it forward, exactly as today.** Nothing about the
  ordinary path changes: write v4, v4 becomes the question, v3's round closes as
  superseded.
- **A steward may move it back.** "Put v3 back on the table" reopens v3's
  superseded round with its responses intact, closes any round on the version
  that was current, and leaves v4 readable as a later draft. **This is the whole
  change.**
- **Moving the question is recorded.** It is a governance act — it decides what
  the community is being asked — so it writes a post in the thread naming who
  moved it and from which version to which, the way a revision note does.
- **Exactly one version takes responses at any moment**, and it is the one the
  column names. **BREAKING**: `respondableProposal` stops comparing against
  `max(proposalVersion)` and compares against `current_proposal_post_id`. A
  response to any other version is refused as it is today.
- **Everything else that means "the newest version" is re-read to say which it
  means.** Two of them mean *the question* and are wrong today the moment the
  two differ: opening the rail with no `?v=` selects the newest version, which
  would put the reader on v4 while the response form is on v3; and
  `proposalToFreeze` falls back to `latestProposal` when a form carries no
  version, which would record v4's words while the community is answering v3.
  **BREAKING** to the `discussions` spec, which requires the most recent version
  to be selected by default.
- **A reopened round keeps its own eligibility snapshot**, not a new one. The
  denominator the community was given when the round opened is the denominator
  it is held to; a member who joined while v4 was the question does not become
  eligible for v3's round by it being reopened.
- **A superseded round comes back, and a deadline that has gone comes off.**
  Superseded is the one closure this undoes. A deadline nobody can still meet
  would have `closeIfDue` close the round again on the next read, so it is
  cleared — and the form says so before the click rather than after.
- **Answering no longer closes a round, and a version holds one round.** Two
  faults that only met each other here. `respond` opened a *second* round when
  it found no open one — unreachable while a replaced version refused responses,
  and reachable the moment a steward could put such a version back; `roundFor`
  reads one row, so every screen kept showing the first round while every new
  answer landed in the second. And a round closed itself as soon as the last
  eligible member answered, which meant the last person to answer took
  everybody's right to change their mind away with them. **BREAKING** to the
  `consent` spec: a round now closes at a deadline, at supersession, or at the
  freeze — never because the answering finished.
- **The state of a round never refuses the move.** A round every eligible member
  has answered stays closed, and the version still becomes the question, because
  a steward moving it back may be about to record it. What happened to the round
  goes in the thread. Nothing tells a member to "open a new round": a version
  holds one round, and no surface opens one — an earlier draft of this proposal
  said exactly that, and it was an instruction to do the impossible.
- **The eligible members who have not yet answered are told the question is
  back.** Reopening writes no round, so nothing notifies today — and the members
  whose live round returned are exactly the people who need to know. The
  existing `consent.opened` notification says what needs saying; nobody who has
  already answered is told, and nobody is told about a round that closed.
- **The rail says which version is being asked about**, which is no longer the
  same statement as "the latest version". A version that is neither current nor
  frozen reads as a draft.

What this deliberately does **not** do: let two rounds run at once. One question
at a time is what makes "9 of 27 responded" a sentence about something. See
`design.md` for the two alternatives and why they were rejected.

## Capabilities

### New Capabilities

None. Both capabilities affected already have specs.

### Modified Capabilities

- `consent`: which version takes responses is the one the discussion names, not
  the newest; a superseded round can be reopened by a steward, keeping its
  eligibility snapshot and its responses; a round closed by its deadline cannot;
  a version holds at most one round; and answering no longer closes a round, so
  a member may still change their answer after everybody has answered.
- `discussions`: a discussion carries the proposal version it is currently
  asking about; moving it is a steward act, recorded in the thread; and the rail
  opens on the version being asked about rather than on the newest.

## Impact

**Schema.** `discussion.current_proposal_post_id`, nullable, **with no foreign
key** — the same shape as `discussion.frozen_decision_id` beside it, and for the
same reason: `post.discussion_id` already references `discussion` on cascade, so
a constraint in the other direction is a cycle SQLite has to unpick every time a
community is deleted. Null means the discussion has no proposal yet. A migration
backfills it to each thread's highest `proposal_version`, which is exactly
today's behaviour, so no existing thread changes meaning.

**Services.** `services/discussions.ts` — `writeProposal` sets the column as
well as superseding the previous round, in the transaction it already has;
`proposalToFreeze` falls back to the current version rather than the newest; a
new `setCurrentProposal` for the steward act. `voting/consent-round.ts` —
`respondableProposal` reads the column, and a `reopenRound` un-closes a
superseded one. `services/decisions.ts` — unchanged: `freeze` already takes the
version the form carried and must keep being able to freeze a non-current one.

**No new provider methods.** Supersession already reaches into `consent_round`
directly from `writeProposal` rather than through `VotingProvider`, so the
reverse does too. Widening a three-method interface for one caller would be a
seam nothing is asking for.

**Permissions.** One new capability, `proposal.set_current`, held by `steward`.
It is not `consent.open`: opening a round is a system act nobody performs any
more, and this is the opposite — a deliberate act with a name on it.

**Routes.** `(app)/c/[slug]/discussions/[id]/` — one action, and the rail gains
the control on a version that is superseded but not frozen.

**Tests.** The consent suite asserts that a superseded version refuses
responses; that stays true and gains the reopened case. The discussions suite
gains the column's forward move, the rail's default selection and the freeze
fallback. `tests/unit/permissions.test.ts` asserts an expectation for every
capability and fails the build without one, so the new row lands there in the
same commit. `tests/e2e/discussion-rail.spec.ts` gains the journey: consent on
v3, post v4, put v3 back, the remaining members answer v3, freeze v3 on the full
tally.

**Out of scope.** Choosing a *new* deadline when reopening; a member *asking* a
steward to move the question back; more than one round per version; and any
change to what a freeze quotes.

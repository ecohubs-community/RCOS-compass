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
- **A reopened round keeps its own eligibility snapshot**, not a new one. The
  denominator the community was given when the round opened is the denominator
  it is held to; a member who joined while v4 was the question does not become
  eligible for v3's round by it being reopened.
- **A round that was closed by its deadline does not reopen.** Superseded is the
  only closure this undoes. A deadline is a thing somebody chose, and reopening
  past it would let a steward relitigate a round that ended on its own terms.
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
  eligibility snapshot and its responses; a round closed by its deadline cannot.
- `discussions`: a discussion carries the proposal version it is currently
  asking about; moving it is a steward act, recorded in the thread.

## Impact

**Schema.** `discussion.current_proposal_post_id`, nullable, referencing `post`.
Null means the discussion has no proposal yet. A migration backfills it to each
thread's highest `proposal_version`, which is exactly today's behaviour, so no
existing thread changes meaning.

**Services.** `services/discussions.ts` — `writeProposal` sets the column as
well as superseding the previous round, in the transaction it already has; a new
`setCurrentProposal` for the steward act. `voting/consent-round.ts` —
`respondableProposal` reads the column; `reopenRound` un-closes a superseded
round. `services/decisions.ts` — unchanged: `freeze` already takes the version
the form carried and must keep being able to freeze a non-current one.

**Permissions.** One new capability, `proposal.set_current`, held by `steward`.
It is not `consent.open`: opening a round is a system act nobody performs any
more, and this is the opposite — a deliberate act with a name on it.

**Routes.** `(app)/c/[slug]/discussions/[id]/` — one action, and the rail gains
the control on a version that is superseded but not frozen.

**Tests.** The consent suite asserts that a superseded version refuses
responses; that stays true and gains the reopened case. The discussions suite
gains the column's forward move. `tests/e2e/discussion-rail.spec.ts` gains the
journey: consent on v3, post v4, put v3 back, the remaining members answer v3,
freeze v3 on the full tally.

**Out of scope.** Choosing a deadline when reopening; a member *asking* a
steward to move the question back; and any change to what a freeze quotes.

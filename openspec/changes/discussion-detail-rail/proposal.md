## Why

The discussion screen is one column: the thread, then a stack of forms, then a
proposal card at the bottom. Nothing on it says which version of a proposal a
response belongs to, nobody's name appears beside anything they wrote, and
opening a consent round is a steward act a member has to wait for before their
support can be recorded at all.

What a community loses without this is the ability to tell, later, **who agreed
to what text**. Today five people can consent, the proposer can revise the
wording, and the five consents stay on screen as if they were consents to the new
words. `consent_round` already hangs off `proposal_post_id` — the database knows
better than the screen does. The freeze then records a tally the community never
actually gave, on a decision that keeps its numbers forever, and the register is
the one place Compass promises never to be wrong.

Reasoning: `UI Spec — v0.1 (draft).md` §5.1 (the thread and the freeze),
`docs/03-data-model.md` §3 (discussion, post, objection, consent round),
`docs/04-security.md` §1 (a member proposes; a steward records),
`design_files/platform/RCOS Compass.dc.html` screens 06, 06b, 06c.

## What Changes

- **The screen becomes two panes.** The thread scrolls on the left under a
  composer that switches between replying, revising and writing up a meeting. A
  430px rail on the right holds one thing: one proposal version, what people have
  said about *that version*, and the freeze.
- **The version buttons are the rail's navigation.** Selecting v2 shows v2's
  text, v2's responses, v2's linter result and a freeze that would adopt v2. The
  selection is in the URL, so a version is linkable and the rail works with no
  JavaScript.
- **A version's button says whether it was frozen and whether that still
  stands** — never frozen, frozen and in force, or frozen and later superseded —
  derived from the decision it produced and that decision's status.
- **A steward may freeze a version that is not the latest.** A community can vote
  through v3, watch v4 draw objections, and record v3. **BREAKING**:
  `proposalToFreeze` stops resolving the thread's most recent proposal and takes
  the version the form carried. The form says so when the selected version is not
  the latest, and names the later one.
- **A freeze no longer ends the thread.** **BREAKING**: `discussion.status =
  'frozen'` stops blocking writes. A thread can produce v5 months after v3 was
  decided and freeze that too, and the second decision supersedes the first
  through machinery `freeze` already has. The screen names the decision in force
  instead of saying "start a new one to change it".
- **A consent round opens on the first response, not on a steward's say-so.**
  Support is consent — the value already exists. The round is opened as a system
  act inside the same transaction as the response that triggered it, and
  `consent_eligible` is snapshotted at that moment. **BREAKING**: the "open a round for
  N days" form is removed. `consent.open` stays in the matrix, because
  `openRound` stays on the provider interface and still needs a guard — it is
  simply no longer reachable from the discussion screen.
- **A round's deadline becomes optional.** A round nobody opened deliberately has
  no deadline anyone chose, so `closes_at` becomes nullable and a round with no
  deadline runs until the freeze or a new version closes it. **BREAKING** to the
  `consent` spec, which currently requires a deadline.
- **A response of any of the three values may carry a reason, and the reason
  becomes a post in the thread.** Today only an objection's reason has anywhere
  to live. A consent with a reason and an abstain with a reason are the two most
  useful things a quiet member says, and both are currently discarded.
- **Votes appear in the thread as one collapsible block**, placed where the first
  vote on that version was cast. Collapsed it summarises; expanded it lists every
  vote with its value, who cast it, their reason if they gave one, and when. The
  rail's counts link to it.
- **A new version closes the previous version's round as `superseded`**, keeps
  its responses readable, and the rail says so: "v2 held 5 consents — not
  carried, the text changed." Today that round stays `open` forever with nothing
  to close it.
- **Every post shows who wrote it**, routed through `personLabel` so erasure
  holds.
- **A revision carries a note** saying what changed, shown in the thread as an
  event with a link to compare the two versions.
- **The freeze modal names its version** — "Freeze v3 into a decision · v3 of 3,
  as written on 19 Aug" — carries the review date and the attendee list the
  service already accepts but the form never sends, and says *before* it is
  submitted that freezing with an objection open will be recorded as such.

The version model, stated once:

```
  v1   v2   v3   v4   v5          selecting a button changes the whole rail
       ─────────────────
  ·    ·    ●    ·    ◐           ● frozen, in force
                                  ◐ frozen, superseded by a later decision
                                  · never frozen
  DEC-2026-015 adopted v3 in August.
  v4 drew objections and was never frozen.
  v5 was frozen in November and superseded DEC-2026-015.
  The thread was open throughout.
```

Out of scope, deliberately: the meeting write-up rework (attendance on a post, a
contest window on a summary), and the line-by-line linter, which is
`line-by-line-linter`. The rail renders the linter exactly as it works today and
improves when that change lands.

## Capabilities

### New Capabilities

None. Every part of this is a change to behaviour that already has a spec.

### Modified Capabilities

- `consent`: a round opens on the first response rather than by a steward act;
  a deadline becomes optional; a response of any value may carry a reason; a
  round on a superseded version is closed and stays readable.
- `discussions`: a thread names the author of every post; a proposal revision
  carries a note describing what changed; the votes on a version appear in the
  thread at the point the first was cast; a thread stays open after a freeze; and
  one version is selected, with the whole proposal panel following it.
- `decisions`: the freeze adopts the version the steward selected rather than
  the thread's latest; a thread may produce more than one decision over its life;
  a version reports whether it was frozen and whether that still stands; and the
  freeze form states the consequence of an open objection before it is submitted
  rather than after.

## Impact

**Schema.** `consent_round.closes_at` nullable; `superseded` added to
`consent_round.status` with a `superseded_by_post_id`; `consent_response.reason_post_id`
alongside the existing `objection_id`, which keeps carrying the objection's own
lifecycle; `post.revision_note`.

**Services.** `voting/consent-round.ts` (lazy open, optional deadline,
supersession, reasons), `services/discussions.ts` (`addProposal` becomes
transactional so it can close the previous round in the same commit;
`requireWritable` stops treating `frozen` as terminal; `proposalToFreeze` takes
the version to freeze), `services/objections.ts` (an objection is now always a
response's reason, never a free-standing act),
`services/decisions.ts` (`freeze` takes `proposalPostId`, and stops setting a
terminal status on the thread — `discussion.frozenDecisionId` becomes the most
recent decision the thread produced, not its last word).

**Routes.** `(app)/c/[slug]/discussions/[id]/` rewritten — both files. The
`openRound` action is deleted; `load` takes a version from the query string;
`respond` gains a reason; `freeze` gains `proposalPostId`, `reviewDueAt` and
`attendees`.

**Shell.** `(app)/c/[slug]/+layout.svelte` scrolls the content column as one box
and ends in a footer. This screen needs two independently scrolling panes and a
pinned composer, so the layout needs a deliberate opt-out rather than a stray
`h-screen` on one page.

**Permissions.** Unchanged. `consent.open` keeps guarding `openRound`, which
keeps its place on the provider interface; only the route action goes.

**Tests.** `tests/integration/discussions.test.ts` and the consent suite both
assert the steward-opens-a-round flow; both change.

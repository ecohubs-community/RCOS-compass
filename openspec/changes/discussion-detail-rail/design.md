## Context

The discussion detail screen is the only place in Compass where a community
argues, and it is the last screen before the register — the one surface where
being wrong is permanent. Today it renders as one column of forms.

The database is already right. `consent_round` and `objection` both hang off
`proposal_post_id`, and `post_proposal_version_idx` makes a version unique within
its thread. What is missing is a screen that believes the schema: nothing on the
current page says which version a response belongs to, and `openRoundFor` looks
up rounds by *the latest* proposal, so v2's round vanishes from view the moment
v3 is posted while staying `open` in the table forever with nothing to close it.

Design: `design_files/platform/RCOS Compass.dc.html`, screens 06 (thread and
rail), 06b (freeze), 06c (rail with no proposal).

Constraints that shape everything below: services hold the logic and routes
parse, call and shape (`AGENT.md`); the freeze is one transaction with gapless
refs (`docs/03-data-model.md` §7); every name goes through `personLabel`
(`docs/03` §10); Tailwind utilities only, no hex in components
(`docs/02-component-guidelines.md`); 375px.

## Goals / Non-Goals

**Goals**

- A response is visibly and durably attached to one proposal version.
- Supporting a proposal takes one click and no steward.
- A reason given with any response is readable as conversation.
- A freeze adopts text the person freezing actually read.

**Non-Goals**

- The meeting write-up rework — attendance on a post, a contest window on a
  summary. The existing `takeOffline` stays as it is; the composer's third mode
  is a new front on the same action.
- The line-by-line linter. The rail renders `lint()`'s current flat output and
  gets better when `line-by-line-linter` lands.
- Real-time updates. The screen is server-rendered and reloads on action.
- A second voting provider. The interface stays; only the built-in provider's
  opening semantics change.

## Decisions

### The round opens lazily, as a system act

**Chosen:** `respond` opens the round itself when none exists, inside its own
transaction, and `consent.open` leaves the permission matrix.

The alternative was keeping `openRound` as a steward act and adding a
free-standing `support` table beside `objection` so members could support without
one. That means two tallies to keep in step, two denominators, and a second
place for "who agreed to this text" to live — which is exactly the ambiguity the
change exists to remove. `consent_response` already holds all three values with
a unique constraint per member.

The permission question is real: `consent.open` is steward-only
(`docs/04-security.md` §1) and a member's click would now cause it. The resolution
is that the steward act was always *freezing*, never opening — the spec already
says a round informs a freeze and never performs one, so opening a round decides
nothing and needs no authority. `openedBy` is left null on a lazily-opened round
rather than being set to the first responder, because nobody opened it.

`consent.open` **stays in the matrix.** An earlier draft of this design removed
it, on the grounds that a permission nothing checks is a claim about the system
that is not true. That reasoning was right and its premise was wrong: `openRound`
survives on the provider interface — the spec requires a round to be reachable
through it, and choosing a deadline really is a steward's act — so the permission
still guards something real. What is removed is the *route action*, not the
permission. Guarding `openRound` with a borrowed steward permission instead would
have been the same lie in a less visible place.

### Eligibility is snapshotted at the first response, not at the proposal

A consequence of laziness, and the better of the two. Snapshotting at the
proposal would mean a member who joins the day after a proposal is written can
never respond to it. Snapshotting at the first response means the denominator is
"the community as it stood when this text was first answered", which is both
defensible and the same rule the existing spec already applies to everyone
joining later.

### A deadline becomes optional rather than defaulted

**Chosen:** `closes_at` nullable; a round with no deadline runs until everyone
has responded, the version is superseded, or the freeze closes it.

The alternative was defaulting to a window — seven days, or a number from the
Decision Matrix. Both invent a deadline nobody agreed to and then let it expire,
which produces a closed round and a "the deadline passed" state for a community
that never asked for one. The rail in the design shows a state ("5 of 19 · 14 not
yet"), never a countdown. Communities that want a deadline get one when the
Decision Matrix work gives them somewhere to say so.

`respond` must therefore stop assuming `closesAt` is a date. The existing
future-deadline guard stays, but only for rounds that carry one.

### Supersession is a status, not a cancellation

**Chosen:** add `superseded` to `consent_round.status` with `superseded_by_post_id`.

`cancelled` already exists and would compile, but it reads as an act somebody
took. Nobody cancelled v2's round; v2 stopped being the text on the table. The
register and the thread both show this state to members, and a status that
misdescribes what happened is a small lie in a system whose whole claim is that
its record is accurate.

Closing happens inside `addProposal`, which means `addProposal` becomes
transactional. It is not today — `takeOffline` is, `addProposal` is not — so a
new version and the closure of the old round would otherwise be two commits with
a window between them where both versions look current.

### A response's reason is a post, and the response points at it

**Chosen:** `consent_response.reason_post_id`, replacing the objection-only
`objection_id` path for reasons.

The design's own words on the reason field are "posts to the thread", and Tomás's
objection is drawn as a thread event. Storing a reason as a string on the
response would mean the thread and the rail hold two different texts that must
agree — and only one of them is quotable, searchable, or attributable through the
existing post machinery.

`objection.reason` stays where it is: an objection's reason is required and has a
lifecycle of its own, so it keeps its column and *also* gets a post. The post is
the readable copy; the column is the one the objection lifecycle owns.

### The rail shows avatars, not names, and always exactly as many

**Chosen:** each response row in the rail shows up to three initial-avatars and
then a `+N` for the rest. Names appear in the vote block, where there is room for
them.

The design drew first names ("Ana, Marco, Sofía"), which sets the row's width by
whose parents chose short names. At 375px, and in a community where three people
are called something long, the row either wraps, truncates mid-name, or pushes
the count off the edge — three different layouts for one piece of information.

Avatars are fixed-width by construction, so the row is the same size for three
supports and for nineteen, and `+N` carries what the avatars cannot. Initials
come from the same `personLabel` the thread uses, so an erased member's avatar is
their former-member label's initials and never the initials of a name we are no
longer allowed to print. The full list is one click away in the vote block, which
is where somebody who wants names is already going.

### The vote block is one collapsible post per version, placed at the first vote

**Chosen:** a synthetic thread entry keyed by round, not a real `post` row.

The alternative — anchoring the rail's counts to individual reason posts — breaks
as soon as a count stands for more than one response: "3 consents" has no single
post to point at, and "1 reason" pointing at a post while "3" points nowhere is
two behaviours for one row.

So the counts all lead to one place. The block sits at `round.openedAt`, which is
by construction the moment of the first response to that version — no new
timestamp is needed. Collapsed it is a summary line; expanded it lists each
response with value, responder, reason and time. Reason posts stay in the thread
in their own right, at their own times, because the reason someone gave is part
of the conversation and not only part of a tally.

Rendering is a `<details>` element, so it works with no JavaScript and the rail's
links are ordinary fragment links to it.

### The version buttons are navigation, and the whole rail is a function of the selection

**Chosen:** the selected version lives in the query string; `load` resolves it
once and every part of the rail — text, responses, linter, freeze — reads that
one version.

The alternative was letting the rail always show the latest and offering older
versions as a read-only history. That fails the case this change exists for: a
community votes through v3, someone writes v4, v4 draws objections, and the
community wants v3. If the rail only ever shows the latest, the text they agreed
on is reachable but not actionable.

Putting the selection in the URL rather than in component state costs nothing and
buys three things: a version is linkable, the panel works with no JavaScript, and
the freeze form's hidden `proposalPostId` and the panel around it cannot disagree
about which version is on screen.

An unknown or foreign version number falls back to the latest rather than
erroring. A bad `?v=` is a stale link, not an attack, and an error page for one
is a worse answer than the current version.

### The freeze adopts the selected version, and freezing an older one is normal

**Chosen:** the form posts `proposalPostId`; `proposalToFreeze` takes it and
validates that it belongs to this discussion and is not already frozen.

Today `proposalToFreeze` resolves *the latest* proposal at submission time. That
is wrong in both directions. It silently records v4's text for a steward who read
v3 and submitted after v4 landed — and it makes freezing v3 on purpose
impossible.

An earlier draft of this design refused the freeze when a newer version existed.
That was the wrong fix: a newer version is not a conflict, it is the ordinary
state of a thread that is still arguing. What the steward needs is not a refusal
but a sentence — the form says the selected version is not the latest and names
the later one — and then their judgement stands. Recording is a human act with a
name on it; the application's job is to make sure they knew what they were
recording.

### A freeze does not end the thread

**Chosen:** `requireWritable` stops treating `frozen` as terminal; the thread's
status returns to open when a new version is posted after a freeze;
`discussion.frozenDecisionId` becomes the most recent decision the thread
produced.

Today `freeze` sets `discussion.status = 'frozen'` and `requireWritable` refuses
every subsequent write, and the screen says "Start a new one to change it". That
made sense while a thread produced at most one decision. It cannot survive
selectable versions: v5, written months after v3 was decided, has to live
somewhere, and the only honest place is the thread that produced v3 — the
argument is the same argument.

What already works and is not touched: freezing v5 supersedes the v3 decision
through `definition.adoptedVersionId`, which `freeze` already follows, and the
`decisions` spec already requires. That machinery was built for this and has
simply never been reachable from one thread.

`abandoned` stays terminal. Abandoning is the act that ends a discussion, and
after this change it is the only one.

### A version's frozen state is derived, never stored

**Chosen:** `post.frozenDecisionId` joined to `decision.status` gives the three
states — never frozen, frozen and in force, frozen and superseded.

A `state` column on the post would have to be updated every time a later freeze
supersedes an earlier decision, from inside a transaction that is already the
most delicate one in the system. The join is cheap, and a derived value cannot
drift from the decision it describes.

### The composer's mode lives in the URL, like the version

**Chosen:** `?mode=revise` and `?mode=meeting`, with the mode buttons as links.

Component state was the obvious first cut and was wrong in a way only a
no-JavaScript test could see: with the mode in a rune, the reply box was the
*only* composer that rendered for a member without JavaScript, so writing a
proposal or recording a meeting became impossible for them. Those are the two
acts that produce everything the register later quotes, and `docs/01` is explicit
that a form works before the bundle arrives or it does not work.

It also gives the empty rail's "Write a proposal" somewhere to point, and makes
the composer state shareable in the same way the version is.

A consequence worth naming: `propose` and `offline` now redirect to the version
they just wrote. Without that, a member who revised v3 at `?v=3&mode=revise`
would land back on v3 with a banner telling them v4 is the later version —
looking at the old text immediately after writing the new one.

### The shell opts out for this one screen

The layout's content column is one scrolling box ending in a footer
(`+layout.svelte`). This screen needs two independently scrolling panes and a
composer pinned to the bottom of one. Rather than a stray `h-screen`, the layout
gains an explicit full-height mode a page can request, so the next screen that
needs it does not invent a second mechanism. On a phone the two panes stack: the
rail becomes a section above the composer, per `docs/02` §mobile.

## Risks / Trade-offs

**Removing `consent.open` is a permission removal, and permissions are a
security surface.** → The matrix and `docs/04-security.md` §1 change in the same
commit, and the permission-matrix test asserts the key is gone rather than
merely unused, so a later reintroduction is deliberate.

**A lazily-opened round can be triggered by a member, so a member now causes an
`consent_eligible` snapshot of the whole membership.** → It is bounded by the
membership size and happens once per version. The insert is the same one
`openRound` does today; only the caller changed.

**`addProposal` becoming transactional changes an existing call path**, including
`takeOffline`, which already runs inside a transaction and would nest. →
`addProposal`'s body is factored so the transactional wrapper is applied by the
caller, matching how `takeOffline` already threads `tx` through `writePost`.

**A round with no deadline never closes on its own**, so a thread abandoned
mid-vote holds an open round forever. → This is already true of abandoned threads
generally, and `discussion.status = 'abandoned'` is the existing answer. The
round is closed when the discussion is.

**Reason posts make the thread noisier**, and a proposal with nineteen
reasoned responses produces nineteen posts. → Only responses that *give* a reason
post at all, and the block gathers the votes themselves. If this proves wrong in
the pilot, the fix is a rendering change, not a schema one.

**A thread that never ends is a thread that never gets archived**, and the
dashboard's "stalled 12 days" reads `lastActivityAt` on threads that used to
close themselves by freezing. → A thread with a decision in force and no newer
version is not stalled, and the stalled calculation must exclude it. This is a
query change in the dashboard, and it lands in the same commit as the status
change rather than being discovered later.

**Removing the terminal `frozen` status weakens a guard that currently prevents
editing a decided thread.** → What it protected was never the decision — the
decision is immutable by construction, `post.frozenDecisionId` is set inside the
freeze transaction, and "a proposal can be frozen once" is enforced on the
proposal, not on the thread. The guard was preventing a second *conversation*,
which is not a correctness property. The frozen-once test moves to the proposal
level, where it belongs, and is asserted there rather than deleted.

## Migration Plan

1. **Schema.** Nullable `closes_at`; `superseded` in the status enum with
   `superseded_by_post_id`; `consent_response.reason_post_id`;
   `post.revision_note`. All additive or widening — no existing row changes
   meaning.
2. **Existing open rounds keep their deadlines** and behave exactly as before;
   nothing back-fills.
3. **Orphaned rounds.** Rounds currently `open` on a superseded version are the
   bug this change fixes. A one-off migration step closes them as `superseded`,
   setting `superseded_by_post_id` to the next version in their thread. This is
   the only data correction, and it is the correct state, not a guess.
4. **`consent.open` removal** lands with the matrix change and the route's
   `openRound` action deletion in the same commit.
5. **Rollback** is the schema revert plus restoring `openRound`; the closed
   orphan rounds stay closed, which is harmless.

## Open Questions

- Should a member be able to withdraw a response entirely, as distinct from
  changing it to abstain? The schema has no "no response" state to return to,
  and the design does not show one. Left as-is: changing to abstain is the
  available path.

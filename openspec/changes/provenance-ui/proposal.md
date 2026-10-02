## Why

The UI spec's promise for the workhorse screen is that **"provenance is never
more than one glance away from the rule itself"** (§4.3). Today it is several
clicks away, or nowhere. The data is almost all there — every decision carries
its mechanism, tally and review date; every discussion knows its clause; every
confirmed piece of evidence knows its clause — but the definition page's "How we
got here" column shows a review date and a raw artifact key, and the reads that
would fill it do not exist.

Four more gaps sit on the same seam, between what a community decided and being
able to see how:

- **An artifact has no page.** The Artifacts list's "Open" jumps to the Standard
  browser at an anchor. §4.8 asks for "one page per mandatory artifact showing
  completeness and the clauses that feed it", and design 15 draws it.
- **A consent round has no face.** No route opens a round deliberately, so every
  round starts on its first response with no closing time; `Tally.threshold` is
  always null; an objection offers a steward one button, "Mark addressed", gated
  on the wrong capability and taking no note. Design 13 draws a round with a
  closing countdown, a "What it takes to pass" checklist and per-objection
  Reply / Amend / Resolve.
- **A member cannot ask for the question to be moved back.** The last change let
  a steward put v3 back on the table and listed the member's side as out of
  scope. A member who wants it today has to say so in prose and hope a steward
  reads it. Answered 2026-09-23: a member may ask, as a thread act.
- **Local definitions are a dead end.** Nothing in the UI creates one
  (`createDefinition` is called only from tests), a discussion cannot be opened
  on one, and so one cannot be frozen. docs/04 §1 says any member may create
  one. There is also no definitions index to find them in — the nav entry was
  folded into "Standard & definitions" because both pointed at the same page.

What a community loses without this: a steward asked "why is our probation
period six months?" at an assembly cannot answer from the rule's own page; a
member who agrees with v3 and not v4 has no act to perform; a community's own
rules — the Thursday dinner, the tool shed — cannot be written down in the tool
at all.

Reasoning: `UI Spec — v0.1 (draft).md` §1.2, §1.4a–b, §4.0, §4.3, §4.8, §5.1;
`docs/03-data-model.md` §3, §3a, §3a.1, §3b, §5; `docs/04-security.md` §1;
`docs/02-component-guidelines.md` §7; design artboards 03, 11, 13, 14, 15 in
`design_files/platform/RCOS Compass.dc.html`.

## What Changes

- **Definition detail: "How we got here" is filled.** Discussions on this
  definition (by `definitionId` *or* by the section it answers, through
  `sectionOf` — the thread's `section_key`, else its clause's owner, the rule
  the Path and the freeze already share), the open proposal, the decision behind
  the adopted version (ref, mechanism, tally, date, review due, provisional),
  earlier versions, related definitions and confirmed evidence. The header —
  which already cites its clauses and opens "The requirement" and "What to
  cover" (#5, #6) — gains the layer and artifact breadcrumb, the obligation chip,
  a **derived status** chip, and *Start discussion* / *Propose change*.
- **One derived definition status**, computed as docs/03 §5 describes
  (not started → drafting → in discussion → in a round → adopted, with needs
  review), used by the header, the index and the Standard browser instead of the
  three-way approximation each computes today.
- **An artifact detail page** at `/c/[slug]/artifacts/[key]`: required sections
  with the definition answering each and its status, local additions in a
  separate block that never counts, completeness as **counts and, for members,
  a percentage of sections answered** (decided 2026-10-01; never worded as
  compliance, never on a public page) — the Artifacts list gains the same
  percentage —
  what is blocking completeness (including a Layer 0–2 definition hidden from
  members, which costs compliance since #9), publication state with a steward's
  *Publish*,
  and publication history read from the change log. The list's "Open" links here.
- **A consent round view** inside the discussion: a steward can set or change a
  round's closing time and the rail counts down to it; each objection shows who
  raised it and when, and offers *Reply in thread*, *Amend the proposal* and
  *Resolve* (addressed / overruled, with a note, for `objection.resolve`);
  **"What it takes to pass"** lists the facts — present of eligible, open
  objections, days open — against the community's **interim adoption rule** when
  it has recorded one, and never gates the freeze.
- **An interim adoption rule setting** (§4.9): a quorum and a minimum number of
  days a round stays open, both optional. It informs the checklist; nothing
  enforces it — "the app does not enforce anyone's threshold" (§5.1).
- **A member may ask for the question to be moved back**: a move request is a
  thread post plus a record with a lifecycle (open → granted / declined /
  withdrawn / lapsed), stewards are notified, and a steward answers it from the
  post — granting it performs the existing `setCurrentProposal`.
- **A definitions index** at `/c/[slug]/definitions` with status, artifact,
  *Needs my attention* and *Provisional* filters, card rows below 768px, and its
  own nav entry again — now a different page from the Standard browser.
- **Local definitions become usable end to end**: a member can create one from
  the index (*New definition*) — ticking "RCOS should require this" records it
  as feedback on the standard, the first screen that can — and open a discussion
  on it from its page. The service and the freeze already handle a discussion on
  a definition; only the form and a freeze test are missing. Its detail page shows "Why we made this rule" (its purpose), who asked for
  it and when it was first written down, instead of hiding the left column.

- **Publishing and withdrawing an artifact write a decision record** (decided
  2026-10-01 to do it here). The `publishing` and `decisions` specs already
  require it; `publishing.ts` writes only a change-log entry today. The
  decision takes the next gapless `DEC-` reference from the same allocation the
  freeze uses, now one helper instead of three inline copies.

Out of scope, named so nobody assumes otherwise: artifact-level versions (§1.2 —
"nothing is authored at artifact level"; the design's "v2 / Publish v3" is read
as publication history), per-definition export, reading thresholds out of an
adopted Meeting Practice text, and anything in P8.

## Capabilities

### New Capabilities

- `artifact-detail`: one page per artifact — required sections and what answers
  them, local additions kept apart, completeness as counts, blockers,
  publication state and history.

### Modified Capabilities

- `definitions`: derived status; the provenance column; version history;
  related definitions; the definitions index; creating, discussing and freezing
  a local definition; local definition detail content.
- `consent`: a steward sets a round's closing time; objection actions with
  attribution and a resolution note; the "What it takes to pass" checklist and
  the interim adoption rule it reads.
- `discussions`: a member's request to move the question back and a steward's
  answer to it; a discussion may be opened on a definition.
- `notifications`: stewards are told about a move request; the requester is
  told how it was answered.
- `authorization`: one new matrix row — `proposal.request_move` (member,
  steward). Creating a local definition stays on `definition.draft`, which
  `createDefinition` already requires and which already grants exactly docs/04's
  "Create a local definition" row. `objection.resolve` becomes the gate for
  resolving objections in the UI, replacing `decision.freeze`.

## Impact

- **Decisions**: `decisions.ts` gains `allocateRef(tx, ctx, now)`, used by the
  freeze paths and by publishing; publishing an artifact writes a decision.
- **Schema** (additive only): `proposal_move_request`; `local_definition_touch`;
  a `move_request` post kind; `community.interim_quorum_num`/`_den` and
  `community.interim_min_days` (nullable). No table rebuilds.
- **Services**: new reads in `definitions.ts` (provenance, versions, related,
  index, derived status), a new `artifacts.ts` (artifact detail, reusing
  `progressOf` and `restrictedInClosedLayers`), `consent-round.ts` (set closing
  time, checklist), `objections.ts` (note required for addressed/overruled),
  `discussions.ts` (move requests), `evidence.ts` (confirmed evidence for a
  definition's clauses — no such read exists today), `notifications.ts` (an
  `activeStewards` helper — none exists). Publishing from the artifact page
  calls the existing single-subject `publish()`; nothing new in `publishing.ts`.
- **Routes**: new `definitions/+page` (the layout's breadcrumb already links
  there and 404s today), `artifacts/[key]/+page`, `settings/adoption-rule`;
  changes to `definitions/[id]`, `discussions/[id]`, `discussions/+page.server.ts`
  (open on a definition), the community layout's nav.
- **Permissions**: one matrix row, mirrored in `docs/04-security.md` §1 and
  `tests/unit/permissions.test.ts`.
- **Notifications**: two kinds, each through `kinds.ts`, `text.ts`, the three
  locales' messages and `jobs/notification-mail.ts`.
- **Version**: `0.11.0 → 0.12.0`.
- **i18n**: every new string through Paraglide; the definition and discussion
  detail pages' existing hard-coded English moves into messages as they are
  touched.
- **Docs**: `docs/03` §5 still says a round closes "when everyone eligible has
  responded" — corrected here; `docs/03` §3a.1 and the code disagree on the
  local left column — the doc wins.

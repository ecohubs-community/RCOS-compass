## Context

Five screens from the design are either missing or hollow, and they share one
job: showing how a community got to what it has. The proposal names them; this
document settles how, and where the design, the UI spec and the specs disagree,
which one wins.

What already exists and is reused rather than rebuilt:

- **Decisions** carry everything the provenance column needs (`schema/decisions.ts`:
  `ref`, `mechanism`, `threshold`, `tallyPresent/For/Against`,
  `unresolvedObjections`, `rationale`, `decidedAt`, `reviewDueAt`,
  `provisional`), reached from `definitionVersion.decisionId`.
- **Versions** are `definition_version` rows with `n`, `adoptedAt`, `decisionId`,
  `supersedesVersionId`, `authorId`. Only `adoptedVersion()` reads them.
- **Completeness** is `progressOf` / `artifactProgress` in `completeness.ts`,
  returning `{authored, answered, complete, missing[]}` per artifact.
- **Publishing** is `publishAll(ctx, subjects)` and the single-subject
  `publish()` / `withdraw()` in `publishing.ts`, behind `artifact.publish`; they
  flip visibility and write `change_log` entries of kind `visibility.published`
  and `visibility.withdrawn`.
- **Built since this proposal was first written** (#5–#9), and reused here:
  `sectionOf(view, thread)` in `completeness.ts` — the one rule from a thread to
  its section (`discussion.section_key`, else the clause's owner); the
  definition page's "The requirement" column (`<Requirement>`), its clause
  references (`<CitedClauses>`) and "What to cover" (`<QuestionGuide>`);
  `requirementFor` / `guideFor` in `requirement.ts`; the per-layer checks and
  `restrictedInClosedLayers` in `layer-checks.ts`, which compliance now reads.
- **Consent rounds** have `openedAt`, `closesAt?`, a status including
  `superseded`, an eligibility snapshot, and responses linked to objections and
  reason posts. `setCurrentProposal` (the last change) moves the question.
- **Objections** have `raisedBy`, `raisedAt`, `state`, `resolvedBy/At`,
  `resolutionNote`; `resolveObjection` already accepts a note.

Constraints that shape every decision below: members propose and stewards
record (docs/04 §1); nothing adopts except a freeze (AGENTS.md); no percentage
on a public page; every screen works at 375px and without JavaScript for its
forms; every new string goes through Paraglide.

## Goals / Non-Goals

**Goals:**

- Every fact the provenance column shows comes from a read that is tested on its
  own, so the column cannot drift from the register.
- One definition status, computed once, shown the same everywhere.
- The consent round view makes the round's state legible without making the app
  a referee: facts against the community's own stated rule, never a gate.
- A member's wish to move the question back becomes a first-class act with an
  answer, not a message that may go unread.
- A local definition can be born, discussed and frozen through the UI.

**Non-Goals:**

- Artifact versions. §1.2: "Nothing is authored at artifact level." The design's
  "v2 adopted / Publish v3" is read as *publication history*, which the change
  log already holds.
- Making publishing write a decision record. The `publishing` and `decisions`
  specs require it; `publishing.ts` writes `change_log` only (it imports
  `decision` and never inserts one). That is a real gap, found while grounding
  this change, and it gets its own change — fixing it here would couple a
  governance-record change to a UI one.
- Parsing thresholds out of an adopted Meeting Practice. The design's footnote
  "These thresholds come from your own Meeting Practice" is the aspiration; the
  interim rule setting is the MVP.
- Per-definition export, the design's header *Export* button. The artifact and
  community exports already exist.
- More than one round per version (still out of scope, as in the last change).

## Decisions

### D1. Discussions for a definition are found two ways, in one read

A thread opened on a clause or a section keeps `definitionId = null` after its
freeze creates the definition. So "discussions about this definition" is
`definitionId = :id` **or** `sectionOf(view, thread) = definition.sectionKey` —
the same rule the Path and the freeze use since #5, so a thread is never shown
on one definition and frozen into another. One read,
`discussionsForDefinition(ctx, id)`, does both and de-duplicates. A local
definition has no section; only the first half applies.

*Alternative considered:* back-fill `definitionId` on freeze. Rejected for this
change — it rewrites history on existing rows, and a thread on a clause is
legitimately *about the clause* before any definition exists. The read is
cheap; the migration is not.

### D2. Derived status is one pure function over facts the caller already has

```
not_started ─► drafting ─► in_discussion ─► in_round ─► adopted
                                                          │
                                   needs_review ◄─────────┘ (reviewDueAt passed)
```

`definitionStatus({ adopted, draft, openDiscussions, openRound, reviewDueAt, now })`
in `src/lib/definitions/status.ts` — pure, no DB, so it can be unit-tested
exhaustively and used by the header, the index and the Standard browser. An
adopted definition with a new open discussion reads `adopted` with a secondary
"in discussion" marker, never as "not adopted": the adopted version stays
authoritative until the next freeze (`definitions` spec). Provisional stays a
separate flag, as it is today.

*Alternative considered:* a stored status column. Rejected — every event that
changes it (a post, a round opening, a freeze, time passing) would have to keep
it in step, and "time passing" has no event.

### D3. Related definitions come from the standard, not a new table

Two sources the standard already carries: `Clause.referencedBy` and
`annotations.yaml` `dependsOn` (`standard/types.ts:38,131`). Map each related
clause to its owning section, and each section to the definition answering it
in this community. Sections with no definition yet appear as "not written yet",
linking to the clause. For a local definition, related means the clauses it
declares it touches (design 14: "Touches §7.2.1 … but satisfies neither") —
which needs no new data only if a local definition records them; see D10.

### D4. The artifact page shows counts, not a percentage

Design 15 shows "62%". §1.2 and docs/03 §3b allow a percentage inward; AGENTS.md
bans one only on public pages. But the Artifacts list deliberately refuses a
per-artifact percentage — "a percentage per artifact would invite reading 80% as
nearly compliant" (`artifacts/+page.svelte:12–15`), and `artifacts.spec.ts:31`
pins that. The detail page follows the list: **"5 of 8 required sections
answered"** plus a segmented bar with one segment per section, which shows the
same thing without inviting the rounding. Changing the list's rule is a product
call, listed as an open question.

### D5. Publication history is a read of the change log

Publishing already writes `visibility.published` / `visibility.withdrawn`
entries. `publicationHistory(ctx, artifactKey)` reads them. *Publish* on the
artifact page calls the existing single-subject `publish()` — the function the
publishing settings' path ends in — so no new entry point exists to diverge,
and it stays behind `artifact.publish`.

### D6. Blockers are derived, never authored

"What is blocking" lists, in order: sections with no definition
(`progressOf().missing`), sections whose definition is provisional, sections
whose definition is restricted in a layer that allows no exception
(`restrictedInClosedLayers`, #9) — the three things compliance reads — and
sections with an open proposal awaiting a round. Each line links to where it is
fixed. The artifact page does not repeat the layer's checks block; it links to
it on the standard page.

### D7. A steward sets a round's closing time; nothing closes it early

Today no route calls `openRound`, so every round opens on its first response
with `closesAt = null`. Rather than resurrecting an explicit "open a round" step
(the last change called it "a system act nobody performs any more"), a steward
may **set or change `closesAt`** on the round for the current version — opening
it if it does not exist yet, through the same `createRound` the first response
uses (`consent-round.ts`) — under the existing `consent.open` capability. The
rail shows "Closes 3 Sep, 20:00 CEST · 2 days left" through `useTime().deadline`:
in the viewer's zone, with the zone named, as the `time-display` spec requires of
a deadline. `openRound` (a provider method no route calls) is not revived. The existing reminder job ("A consent round about to close
reminds those who have not answered") starts working for real, because rounds
now have closing times.

Setting a time in the past is refused. Changing it is recorded as a thread post,
the same way moving the question is — it changes what the community was told.

### D8. "What it takes to pass" is facts against the community's own rule

```
 What it takes to pass           (your interim rule: ¾ present, 7 days)
 ✓ Present          15 of 19     rule: 15 needed
 ⚠ Open objections  1            consent passes with none sustained
 ✓ Days open        6 of 7       rule: 7
```

Nullable columns on `community`: `interim_quorum_num` / `_den` (a fraction,
stored as numerator/denominator to avoid float rounding, e.g. 3/4) and
`interim_min_days`. Set on a new `settings/adoption-rule` page (the bare
`/settings` route only redirects) by `settings.manage`. With no rule
recorded the checklist shows the facts and a line "Your community has not
recorded an interim adoption rule" linking to settings.

**It never gates the freeze.** The design says freeze is "available once the
objection is resolved"; the `consent` spec says freezing MUST be permitted over
an open objection and the decision says so permanently. The spec wins — "the
app does not enforce anyone's threshold" (§5.1). The freeze form repeats the
checklist so the steward freezes knowingly.

*Alternative considered:* parse the adopted Decision Matrix / Meeting Practice.
Rejected for now — free text, and a wrong parse would present the community's
rule back to it incorrectly with the app's authority.

### D9. Objection actions

| Action | Who | What it does |
|---|---|---|
| Reply in thread | anyone who can comment | links to the objection's reason post and opens the reply form quoting it |
| Amend the proposal | `proposal.create` | opens the new-version form prefilled with the current version, with the objection linked in the revision note |
| Resolve | `objection.resolve` | addressed or overruled, with a **required** note |
| Withdraw | the objector | `resolveObjection(state: 'withdrawn')`, which already allows only the raiser; shown as a button on their own objection |

The existing *Mark addressed* is shown under `can.freeze` (`decision.freeze`)
while its server path checks `objection.resolve` and passes no note — two
capabilities that agree today only because both are steward-only. The control
moves to `can.resolveObjection` and the action passes the note, which
`resolveObjection` makes required for addressed and overruled. The load adds
`raisedBy` (tombstone-aware) and `raisedAt`.

### D10. A move request is a post plus a record — the objection pattern

```
 proposal_move_request
 ─────────────────────
 id, community_id, discussion_id,
 requested_by, target_proposal_post_id,
 from_proposal_post_id,           ← what was current when asked
 post_id                          ← the thread post that carries it
 state: open | granted | declined | withdrawn | lapsed
 answered_by?, answered_at?, answer_note?
```

A new post kind `move_request` renders as "Ana asks to put v3 back on the table:
<reason>" with, for stewards, *Put v3 back* (calls `setCurrentProposal` and marks
the request granted, in one transaction) and *Decline* (note required). The
requester may withdraw it. It **lapses** automatically when the question moves
anyway — to the requested version (then it reads granted-by-event, attributed to
whoever moved it) or to a newer version (lapsed). At most one open request per
member per discussion; asking for the version that is already current is
refused. Stewards are found by a new `activeStewards(db, communityId)` in
`services/notifications.ts`, beside `activeMemberships` — no such helper exists.

*Alternatives considered:* a plain message with a convention — rejected, it has
no state and nobody is told; a new notification only — rejected, the thread is
where the community reads what happened (the objection pattern exists for the
same reason).

### D11. Local definitions: create, discuss, freeze

- **Create**: `createDefinition` already takes `CreateLocalDefinition`
  (`{title, purpose?, layer?, attach, standardShouldRequireThis?}`) behind
  `definition.draft` (member, steward — exactly docs/04 §1's "Create a local
  definition" row), and already writes a `standard_feedback` gap when the flag
  is set. A form on the index calls it; no new capability. The form requires a
  layer (§1.4b: a local definition "requires … to declare its layer"); the
  service keeps it optional for its other caller, the test seed.
- **Discuss**: `openDiscussion` already accepts `{ kind: 'definition' }`; the
  open form produces only clause, section and open question. The definition
  page's *Start discussion* posts `definitionId`.
- **Freeze**: `resolveDefinition` already takes the `thread.definitionId` path
  and gives a local definition an empty clause list. Untested for a local
  definition — this change adds that test and no code.
- **Detail**: the left column is "Why we made this rule", as docs/03 §3a.1
  says: the `purpose`, then the community's adopted definitions in the same
  layer for context; plus "Asked for by" (the creator) and "Written down"
  (v1's `adoptedAt`). The design's "First tried Nov 2023, informally" is prose
  and belongs in the purpose — no new column. This reverses the code's "absent
  rather than empty" choice (`definitions/[id]/+page.server.ts:24`) in favour of
  the doc and review log #88.
- **Touches**: a local definition may name the clauses it touches. Stored in a
  small join table `local_definition_touch(definition_id, clause_key)` —
  optional, shown as "Touches §7.2.1 … satisfies neither" through
  `<CitedClauses>`, never counted. It is included because D3's related read
  needs it for local rules.

### D12. The definitions index gets its own nav entry back

The entry was folded into "Standard & definitions" (commit `d6d726b`) because
two nav items pointed at one page. The layout's breadcrumb still links to
`/definitions`, which 404s today; the index fixes that too. With `/c/[slug]/definitions` being its own
page they no longer do, so the reason is gone: "Standard" and "Definitions"
return as two entries under the §4.0 groups. *Needs my attention* means: I am
eligible in an open round on it and have not answered, I authored it and it is
past review, or there is an open move request on its discussion and I am a
steward. Below 768px rows become cards (docs/02 §7).

### D13. Header actions on the definition page

*Start discussion* opens a discussion on the definition (D11) or, if one is
already open, links to it. *Propose change* goes to that discussion's
new-version form. *Version history* is an anchor to the earlier-versions list in
the right column — on a phone, the "How we got here" tab. *Export* is dropped
(non-goal).

### D14. Every new read honours visibility, and none is per-row

A `restricted` definition is readable only by its transparency exception's
audience (`getDefinition` filters through `visibleTo`). The index, the artifact
page, related definitions and the discussion-to-definition read are new ways to
reach a definition, so each filters the same way: a member does not see a
restricted definition's title, text or link; the artifact page shows its section
row as answered and "restricted", which is what the layer checks already reveal.
The index computes derived status for all rows with a fixed number of queries
(definitions, drafts, open discussions by `sectionOf`, open rounds, the reader's
eligibility), never one per definition.

## Risks / Trade-offs

- **[Wide change]** Five surfaces in one change. → Tasks are grouped so each
  group ships behind its own tests and leaves the app coherent; groups 1–3 can
  merge before 4–6 if review wants smaller PRs.
- **[Two-way discussion lookup is easy to get half right]** → D1's read has a
  test for each path and one where both match the same thread.
- **[Checklist read as a verdict]** Showing ✓/⚠ next to a rule can look like the
  app deciding. → Copy says "your rule", the freeze stays available, and a test
  pins that freeze succeeds with every line ⚠.
- **[Move request races the question moving]** A steward moves the question
  while a request is open. → Requests lapse or are granted-by-event in the same
  transaction as `setCurrentProposal` and version posting; a test covers each.
- **[Local freezes touching a path built for clauses]** `resolveDefinition` is
  the freeze's riskiest function. → Its definition-subject branch already
  exists and is not edited; this change adds its first local-definition test,
  and the clause and section paths' tests must pass unchanged.
- **[Hard-coded English on touched pages]** → Strings move to Paraglide as
  touched; the i18n baseline must go down, not up.

## Migration Plan

Additive migration: one table (`proposal_move_request`), one join table
(`local_definition_touch`), three nullable columns on `community`, one post-kind
value (a plain text column — no CHECK, no trigger, so nothing to rebuild). No table rebuilds, so drizzle-kit's twelve-step rebuild stays out of it.
Rollback is dropping the new tables and columns; no existing row changes.
`docs/03` §3a/§5 and `docs/04` §1 are updated with the columns and rows.

## Open Questions

1. **Should the Artifacts list and detail show a percentage inward?** The design
   does, the list's comment argues against it. This change keeps counts (D4).
2. **Who may resolve an objection — stewards only, or also the proposal's
   author?** The matrix says stewards; a community using consent may expect the
   author to address concerns. This change keeps the matrix.
3. **Should a declined move request be re-askable by the same member?** This
   change allows a new request after a decline; it could instead require a new
   version to have been posted in between.
4. **Publishing as a decision** — confirm it gets its own change next (see
   Non-Goals).
5. **Carried over from `movable-current-proposal` 7.2**: should the register
   record that the question moved before a freeze? Recommendation there was no
   extra field; a granted move request now leaves a second, explicit trace in
   the thread, which strengthens that recommendation.

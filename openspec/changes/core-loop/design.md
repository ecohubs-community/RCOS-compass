## Context

The data model for this phase is already written down: `docs/03-data-model.md`
§3–§7 gives the tables, the decision-reference rules, the readiness arithmetic and
the interim adoption rule; `UI Spec` §5.1 gives the loop; `docs/11` gives the
linter. This document does not restate any of that. It records the decisions
those documents leave open, and the ones a reader would otherwise have to
reverse-engineer from the code.

Two constraints shape everything below. **SQLite, single instance** — one writer,
so a serialisable transaction is free and a distributed-lock design would be
solving a problem we do not have (`docs/00-architecture.md` §6, A8). And **the
register is the product** — a decision that cannot be found, attributed and
quoted a year later is worse than no decision recorded at all, because the
community will believe it has one.

## Goals / Non-Goals

**Goals:**

- One act — Freeze — that produces a decision, a version and a change-log entry
  atomically, is safe to submit twice, and never burns a reference number.
- Numbers that are computed, never stored, so they cannot drift from the rows
  they describe.
- A consent round that *informs* a freeze without ever performing one.
- Local definitions that carry the whole machinery and move no number.
- Every screen in `UI Spec` §4 that the loop needs, at every viewport including
  375px, where drafting and freezing must both work.

**Non-Goals:**

- Documents, passages and mapping (P4). A definition's Evidence panel exists but
  is empty.
- The AI half of the linter (P4). The rule-based checks ship here; the model call
  does not.
- The Path's weighted ordering (P5). The Dashboard's "next 5" uses the annotation
  dependency edges already vendored, not the sliders.
- Publishing, export, the public index (P6). A decision has a permalink; nothing
  is readable without signing in yet.
- VoteCast (post-MVP). The seam is built; the second provider is not.

## Decisions

### The freeze is one transaction, and the number is allocated inside it

`seq` comes from `select max(seq) + 1` **inside** the write transaction, not from
a counter row. SQLite serialises writers, so this is already correct; a separate
sequence table would add a row to keep in step with no benefit. It also gives
gaplessness for free in the case that matters: a freeze that rolls back never
consumed a number, because the read and the insert are in the same transaction.

*Alternative considered:* a `community_decision_seq` row updated with the
decision. Rejected — two things to keep consistent instead of one, and it would
still need the same transaction. The Postgres migration (`docs/00` §5) turns this
into `SELECT … FOR UPDATE`, which is why the note stays in the data model.

The year in `DEC-2026-014` is a *stamp*, not part of the key: `seq` keeps counting
across years, so a community's fifteenth decision is `DEC-2027-015`. This is
surprising enough to be worth saying out loud in the register's own help text —
the alternative, resetting each year, makes `DEC-2027-001` ambiguous with a
migrated or imported record and makes "our fourteenth decision" unanswerable.

### Idempotency is a unique index, not a check

`UNIQUE(community_id, idempotency_key)`. The freeze inserts; on conflict it
**returns the existing decision** rather than raising. A check-then-insert would
have a window in which two people hitting Freeze on the same proposal produce two
decisions, which is the exact failure this key exists to prevent. The key is
generated when the modal renders, so a re-submit of the same form is idempotent
while a genuinely new freeze is not.

### Readiness is computed on every read

No materialised readiness column, no cache table. Core 0.1 has 173 countable
clauses and 94 authored sections; the whole computation is two indexed queries
and a join over a few hundred rows. A stored number is a number that can be wrong,
and "the dashboard said 41% but the artifact list disagrees" is precisely the bug
that would destroy trust in every other number the product shows.

Memoised **per request** (one community, one computation, several panels read it),
and invalidated across requests by `invalidate('community:readiness')` with a
matching `depends()` — the mechanism `docs/01` §3 already specifies.

### A Ratification Record has no definition row

Sections dispositioned `filled_from_decision` (`docs/12`) are **rendered** from
the decision that adopted the artifact. No `definition` row is created for them.

This keeps a property worth having: every row in `definition` is text a person
wrote, with an author and a version history that means something. A synthesised
definition would be the one row in the table whose "author" is the system, and
every query over definitions would need to remember that.

*Alternative considered:* create a system-authored definition at freeze time.
Rejected — it makes the ratification record editable, which invites a community
to change a tally after the fact, and it puts a fake author on the permalink.

### Local definitions attach to the artifact, not to a section

`definition.section_key` is nullable; `scope` is `standard | local`. A local
definition carries `local_artifact_id` **or** an `attached_to_artifact` key when
it extends an RCOS artifact (`UI Spec` §1.4b kind 2), and neither makes it
countable. The partial unique index — `UNIQUE(community_standard_id, section_key)
WHERE section_key IS NOT NULL` — is what lets a community hold many local
definitions while still permitting only one answer per standard section.

Every community gets a *Community Agreements* local artifact at creation, in the
same transaction as the community. A community that has to create a container
before writing its first house rule will write the house rule somewhere else.

### `VotingProvider` is an interface with one implementation

```
openRound(ctx, proposal, { deadline, eligible }) → Round
respond(ctx, round, response)                     → Response
tally(ctx, round)                                 → Tally    // pre-fills the freeze
```

The built-in consent round is the default provider. VoteCast becomes a second one
without touching the freeze path, because the freeze consumes a `Tally`, not a
round. The seam is cheap now and expensive later, which is the whole argument.

The round **never freezes anything**. A closed round leaves a proposal with a
tally attached and a person still has to press Freeze — dissent that gets
recorded automatically is dissent nobody read.

### Objections are refused the ability to disappear

An objection is a row with a reason and a state (`open → withdrawn | addressed |
overruled`), not a reaction. Freezing over an open objection is **allowed** — the
app enforces no community's threshold — and the resulting decision permanently
reads *"frozen with 1 unresolved objection"* in the register and on its permalink.
Making it impossible would be the app deciding governance; letting it vanish
quietly is how a community ends up arguing about what was agreed.

### Take offline is a path, not an escape hatch

`discussion.status = decided_offline` with a summary and the proposal that came
out of the room. It reaches the same Freeze modal with the same required fields.
The only difference is that the tally is typed rather than tallied — and the
decision records *how* it was reached, so a reader can tell.

### Drafts: one per definition, `edit_token` rotated on save

One live draft per definition, autosaved on a 2s debounce. Every save carries the
token it was loaded with; a stale token does not overwrite. The second editor is
shown who else is editing and offered *keep mine / take theirs / merge by hand*
(`docs/01` §1). Silent last-write-wins on governance text is a bug a community
notices only after quoting the wrong version.

### Notifications are events plus per-user read state

One `notification` row per recipient per event, rather than an event table joined
to a read table: a member's notification list is then a single indexed read, and
"mark all read" is one update. The weekly digest is a job that reads the same
rows, and — like every mail this product sends — carries a link and no content
(`docs/04` §4).

## Risks / Trade-offs

**The freeze transaction touches six tables.** → Keep it short and pure: no
network call, no AI, no mail inside it. Notifications and the digest are
*enqueued* by the transaction and sent by the worker, so a slow SMTP server can
never hold a write lock.

**Gaplessness depends on the single-writer property.** → It is asserted in a
test that freezes concurrently and checks the sequence, and the Postgres note
lives with the code rather than only in the data model, so whoever does that
migration meets it.

**The year stamp crosses midnight in the community's timezone.** → The freeze
takes the year from `community.timezone`, not from the server, and there is a
test at 31 December 23:59 in a non-UTC zone. A community in Ecuador filing at
18:00 local must not get next year's stamp.

**Readiness is computed on every dashboard load.** → Cheap now; it will not stay
cheap forever. The per-request memo and the `depends()` key are in place so that
introducing a cache later changes one module and no call site.

**A community could reach compliance without ever writing a Ratification
Record.** → That is the intent (`docs/12`), but it changes what "complete" means
for 19 of 21 mandatory artifacts, so `authoredSections()` is asserted in the
completeness tests directly rather than only through a total.

**Six new capabilities at once is a lot of surface.** → They ship in dependency
order — definitions, then discussions, then consent, then decisions, then
readiness, then notifications — and the e2e loop spec (`docs/06` §7) is written
first and stays red until the last of them lands, so "nearly done" is visible
rather than asserted.

## Context

Three features that look unrelated and share one property: each of them makes an
existing pile of correct data usable. The path already computes; the register
already holds decisions; the standard already ships a glossary. None of them can
currently be argued with, searched, or read beside a community's own words.

Two constraints shape the work.

**An opinion has to be visible to be arguable.** The UI spec's phrasing (§4.4) is
the whole design brief: a visible, editable, versioned settings object, not
hidden logic. That rules out the obvious implementation — a scoring function with
constants in the source — because a community cannot disagree with a number it
cannot see.

**The reverse lookup cites and does not answer.** §1.3 promises the application
will never tell a community what its governance should say. A search that returns
clauses and decision references keeps that promise; the same box wired to a model
breaks it, which is why §10 puts freeform Q&A out of the MVP explicitly rather
than by omission.

This is also the phase that spends the raw-SQL exception. `00-architecture.md` §5
forbids raw SQL outside `src/lib/server/db` and names FTS5 as the case that lives
behind an interface with one file per engine — written before there was any FTS5
to put there.

## Goals / Non-Goals

**Goals:**

- A day-one community answers five questions and gets an order it can see the
  reasons for, disagree with, and change.
- Changing the weights is recorded like any other decision, and the previous
  weights stay readable.
- *"Can we spend €800 on the water pump?"* returns the clauses and decisions that
  govern it, from that community and no other.
- The glossary is correct without anybody maintaining it.
- Nothing outside the search module knows that search is FTS5.

**Non-Goals:**

- Freeform Q&A over governance text (UI spec §10). The grounded half ships; the
  freeform half is the one thing §1.3 promises never to do.
- Ranking by semantic similarity or embeddings. FTS5 relevance plus the
  community's own structure is enough for a few hundred rows, and an embedding is
  an opinion nobody can read.
- Cross-community anything.
- A scheduling view. The path is an ordered list, not a Gantt chart (§4.4).

## Decisions

### 1. Four scores, summed, each one visible

Every path item carries the four contributions from §4.4 separately —
`dependency`, `severity`, `risk`, `attention` — and the rank is their weighted
sum. The item's stated reason is generated from whichever contributions actually
moved it, so the sentence and the position come out of one computation and cannot
drift.

*Why not a single opaque score:* a community that disagrees with an ordering
needs to know *which* input it is disagreeing with. "This is high because your
risk profile says you hold land" is arguable; "this is high" is not.

*Alternative considered:* a hand-tuned comparator with the reasoning written as
prose beside it. That is what P3 does today, and it is exactly the shape where
the explanation stops matching the behaviour six months later.

### 2. Weights are a row, versioned like a decision

`path_weights` holds one active row per community plus its history, each with the
actor and time that produced it. Changing weights writes a new row and
supersedes the old; the path screen can therefore say "reordered by Ana on 3
September" and show what changed.

*Why versioned:* the ordering is a governance opinion the community adopted. The
rest of the product treats those as append-only, and an ordering that can be
silently retuned is one nobody can audit — including by the person who retuned
it and forgot.

*Defaults are a named row, not nulls.* A community that never opens the settings
has the same shape of record as one that has, and the defaults are readable
rather than being constants somewhere in the source.

### 3. A manual override keeps the machine's opinion beside it

Dragging an item stores a per-community override with a position. The item then
shows both: where the community put it, and what the ordering would have said.

*Why keep both:* an override that erases the computation makes the list
unfalsifiable — nobody can tell later whether the ordering was wrong or the
community simply disagreed. Keeping both is what lets somebody revisit it.

### 4. The risk profile names its consequences at the moment of answering

Each question, when answered, states which clauses it moves and why: *"Because
you hold land, 4.6 and 5.1 move up."* The interview is skippable, and a community
that skips it is told it is getting the structural ordering rather than being
left to assume the list is personalised.

*Why say it inline:* an interview that silently reorders a list is a worse
version of hidden logic than a scoring function, because it feels like it was
the community's own choice.

### 4a. The default weights have to reproduce a lexicographic sort

P3 orders by unblocked-first, then layer, then document order — a lexicographic
comparator. A weighted sum reproduces that only if the dependency contribution
dominates every other term put together, so the defaults are not four balanced
numbers: dependency is an order of magnitude above the rest, and the settings
screen says so.

*Why it matters that this is written down:* "a community that changes nothing
sees no change" is a requirement, and it is only satisfiable for a particular
shape of default. Someone tuning the defaults to look tidier would break it
silently.

### 5. `SearchIndex` is an interface with one implementation

```
interface SearchIndex {
  index(communityId, doc): void
  remove(communityId, id): void
  query(communityId, text, kinds?): SearchHit[]
}
```

FTS5 lives in one file behind it. `community_id` is a column *inside* the virtual
table and every query filters on it — the boundary is in the query, not applied
to the results afterwards, because a search that fetches across communities and
then filters is one refactor away from not filtering.

*Alternative considered:* one FTS table per community. It makes isolation
structural, and it makes "how many tables does this database have" a function of
how many communities signed up. Rejected as the wrong trade at this scale.

**Clauses are not in the index.** The standard's text is identical for every
community, so indexing it per tenant would store 213 rows once per community and
put non-tenant data inside a structure whose whole discipline is tenant
isolation. Clauses are matched against the loaded standard in memory — it is
already there, it is 213 rows, and the merge happens in the result. What goes in
FTS5 is only what a community wrote: definitions, decisions, discussion titles
and document passages.

*The raw-SQL boundary:* an ESLint rule confines FTS5 SQL to
`src/lib/server/search/`, the way the AI module is confined. Same reasoning —
the architecture doc already says it, and a rule that is only written down is a
rule that erodes.

### 6. The index is written inside the transaction that causes it

Adopting a definition, freezing a decision, opening a discussion: each writes its
index rows in the same transaction as the act. Not a job.

*Why not a job:* a decision that exists and is unfindable for thirty seconds is a
decision a member will conclude did not save. P3 made the same call for
notifications, for the same reason, and this is the second half of that
argument — a register whose contents lag reality is worse than one that is slow.

*What this costs:* the freeze transaction gets slightly longer. It is a local
write to a local table, which is the same class of work as the change-log entry
already in there.

### 7. Reverse lookup: the query is a filter, not a prompt

The plain-language question is tokenised, stop-worded, and handed to FTS5. What
comes back is ranked hits with their clause references and decision refs. There
is no summarisation step, no model, and no natural-language answer — the result
is a list of citations and the member reads them.

*Why this is the whole feature:* it is the same need the freeform version
addresses, minus the one behaviour the product promises never to have. A member
asking about the water pump wants to know which rule applies; being told what the
rule *should* be is a different and much worse product.

### 8. The glossary is a join, and the join does not exist yet

RCOS terms come from the vendored `glossary.yaml`; the community's own column
comes from adopted definitions whose section maps to that term. Nothing is
stored, so nothing can be stale.

**There is no mapping today.** The vendored glossary carries 37 terms, and each
one has exactly one field: its translations. Nothing connects a term to a
section. Every hedge about "where the mapping is missing" would therefore apply
to every term, and the page would be a reprint of the standard with an empty
column — the feature delivered and the value absent, which is the failure this
whole phase exists to avoid.

So the mapping is added **upstream and re-vendored**, in the standard's own
annotation data, and it is the first task rather than a discovery in group 7.
That is the same route P1 took for section dispositions (`docs/12`): the
vendored copy is not a place to edit the standard, and `meta.yaml`'s hash check
makes sure of it.

*Alternative rejected:* matching a term to a section by name similarity. It would
be wrong quietly, and being wrong quietly about which of a community's rules
defines "Member" is worse than showing nothing.

## Risks / Trade-offs

**A visible weight invites bikeshedding** → The defaults are good and the screen
says so. The point is not that communities will tune them; it is that they *can*,
which is what makes the default arguable rather than imposed.

**FTS5 tokenisation is English-first** → `unicode61` handles the Latin-script
locales the MVP targets. German compounds and Spanish stemming are imperfect and
that is stated rather than hidden; the seam is what makes a better tokeniser a
one-file change later.

**The index drifts from the rows** → Written in the same transaction, so drift
means a bug rather than a race. A rebuild command exists for when it happens
anyway, and a test asserts a rebuilt index matches an incrementally-built one.

**Reverse lookup returns nothing for a plain question** → Better than returning
something wrong. An empty result says which words were searched for, so a member
can see it looked for "water pump" and found nothing rather than assuming the
feature is broken.

**Risk-profile answers are sensitive** → "Do you have children on site?" and "does
one person own the property?" are facts about people, not about governance. They
are per-community, visible to members, never in an export that leaves the
building without the community asking, and never sent to a model.

## Migration Plan

One migration: `path_weights`, `path_override`, `risk_profile`, the FTS5 virtual
tables and their triggers. All new; no existing row changes shape.

An instance that takes this deploy gets an empty index until the rebuild command
runs, so the deploy step is: migrate, rebuild, serve. The rebuild is idempotent
and safe to run twice.

Rollback is the migration down. Nothing in P1–P4 depends on any of it; `path()`
keeps its current behaviour when no weights row exists.

## Questions Resolved Before Implementation

Decided before any code, so the reasoning is here rather than in a commit
message — the same treatment P4's three got.

### The interview asks five questions, and each one moves something

| Question | Moves up when yes |
|---|---|
| Do you hold land or buildings together? | Commons classification, asset separation, exit settlement |
| Do you hold money together? | Internal economy, treasury reporting, spending authority |
| Are there children living on site? | Safeguarding duties, conflict escalation, external reporting |
| Does one person own the property, or hold a founder's veto? | Authority registry, power concentration limits, exit rules |
| Do you meet in person, or only online? | In person: meeting and quorum rules. Online: identity, participation, asynchronous consent |

Five, because each earns its place by moving something a community would
otherwise reach late, and the spec makes that testable: a question with no
answer that changes the ordering fails the build.

The last one is deliberately not a yes/no. "Only online" is not the absence of
meeting in person — it moves a *different* set up, and asking it as a negative
would have made the online community's ordering the default community's
ordering minus some things, which is not what it needs.

*What was left out:* how many members, and how long the community has existed.
Both are interesting and neither moves a requirement — the standard asks the
same things of a group of six as of sixty. A question that changes nothing is a
question that teaches people the interview is decoration.

### Decision bodies are indexed; titles and rationales are not enough

The water-pump question is answered by the *text a community adopted* — "any
spend over €500 needs a consent decision" — and that lives in `proposal_text`.
A title is "Spending authority" and would match nothing a member actually types.

The cost is real: proposal text is the longest column in the table and makes
FTS5 relevance noisier. The mitigation is that titles and rationales are
weighted above bodies, so a decision whose *title* matches ranks above one that
merely mentions the words. The exit criteria are the arbiter, not an opinion
about relevance.

### An override survives a weights change, and says it might be stale

A community that reorders by hand and later retunes the weights has expressed
two opinions that can conflict. Three options were open: drop the override, keep
it silently, or keep it and say so.

Keeping it silently is the trap — the community's own instruction disappearing
because they adjusted a slider is the worst of the three, and dropping it makes
a deliberate act of theirs evaporate. So the override survives, and after a
weights change the item carries a note that the ordering has changed underneath
it and offers to release it. The community decides; the tool does not decide
for them, and it does not pretend nothing happened.


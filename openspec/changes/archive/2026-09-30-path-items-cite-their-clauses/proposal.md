## Why

A Path item is a *section* of an RCOS template, but everything after it is keyed
on a single *clause*: the "Start discussion" link carries the first countable
clause the section owns, the thread stores that clause, and the freeze finds its
way back to a section through `clause.owner`. Checking the items against the
standard found that this seam breaks in three ways:

- **An item cites one clause of several.** "Can someone leave at any time — and
  what happens to their things?" is `exit-protocol.voluntary-exit`, which owns
  §3.6.1, §3.6.2 and §3.6.4. The thread it opens is filed under §3.6.1 alone and
  its header prints the raw key `l1.exit-and-separation.1`. Nothing on the Path
  or in the thread says which RCOS text is being answered, so a reader cannot
  check the question against it — which is how a question drifting away from
  its clauses went unnoticed.
- **28 of the 94 items cannot be answered at all.** Those sections own no
  countable clause (non-goals, decision domains, due-process guarantees, the
  four non-operations meeting types, …). Their "Start discussion" falls through
  to a blank form. Filing the thread under a clause they only *reference* is
  worse: the freeze writes the definition to that clause's owner, a different
  section. `createDefinition` is called only from the test seed. Every one of
  those sections is authored, so it counts toward its artifact's completeness —
  and so no community can currently reach "compliant" inside the app.
- **Questions do not cover their clauses.** Of the 66 items that own clauses,
  25 ask something narrower than, or different from, what the clauses
  require (the full audit is in `design.md` §4). The voluntary-exit question
  asks about "their things", which is §3.6.5 — a different Path item — and not
  about §3.6.2's *non-punitive* procedure or §3.6.4's *no loss of rights*.

Reasoning: `UI Spec — v0.1 (draft).md` §4.1b, §4.3, §4.4, §5.1;
`docs/03-data-model.md` §3, §5; `docs/02-component-guidelines.md` §7; design
artboard 03 in `design_files/platform/RCOS Compass.dc.html`.

## What Changes

- **A discussion can name the Path item it answers.** A new nullable
  `discussion.section_key`. The Path starts a thread on the *section*; the
  thread still stores the section's first countable clause when it has one, so
  everything that reads `clause_key` today keeps working. The freeze resolves
  its target section from `section_key` first and `clause.owner` second. The
  Path and the dashboard match an open thread to an item by its section, so two
  items that share a referenced clause never claim each other's thread.
- **All 94 items can be started and frozen**, including the 28 that own no
  countable clause. Such a decision covers no clause and moves no readiness
  number; it completes its section, which is what the artifact's completeness
  already asks for.
- **A Path item shows the RCOS text it answers**: every clause the section cites
  — owned first, then referenced — as `§3.6.1 · §3.6.2 · §3.6.4` through one new
  `<ClauseRef>`, each linking to the standard browser.
- **A discussion shows the same references in its header, and each opens a
  sheet with the original RCOS text**, laid out like design artboard 03's "The
  requirement" column: every clause of the section with its normativity, *Why it
  matters*, *What to define here*, and *What NOT to define here*. The
  definition page's requirement column becomes the same component.
- ***What NOT to define here* is derived, never written.** The vendored
  standard has no such text. It lists what the standard assigns elsewhere: the
  sibling sections of the same template, and the owners of any clause this
  section only references — each with its question and references. Nothing is
  shown that the standard's own structure does not say.
- **Twenty-five questions are reworded** so each covers the clauses its section
  owns. The rewording changes `annotations.yaml` only; order, effort and
  dependencies are untouched, so no community's Path reorders.
- **`pnpm check:standard` refuses an authored section without a question.**
  Every authored section is annotated today; the check keeps it that way.

Version: `0.8.0 → 0.9.0` — members can start and freeze the 28 Path items that
could not be answered, and read the RCOS text from inside a discussion. The
migration adds one nullable column and runs at boot; no manual step.

## Capabilities

### New Capabilities
- `path-items`: what a Path item says and links to — the clauses it cites, a
  question that covers them, a start target for every item, and matching an
  open thread by section.

### Modified Capabilities
- `discussions`: a discussion may name the section it answers; the freeze
  resolves through it; the thread shows the RCOS text it answers.
- `standard-content`: every authored section carries a question.

## Impact

- **Schema:** `discussion.section_key` (text, nullable, indexed with
  `community_id`), one drizzle migration. No backfill: a thread without it
  resolves through `clause.owner` exactly as today.
- **Services:** `discussions.openDiscussion` gains `{ kind: 'section' }`;
  `decisions` freeze-target resolution; `path.path` (start target, thread match,
  cited clauses); a new `requirement.ts` read shared by the definition page and
  the discussion page.
- **Routes:** `/c/[slug]/path`, `/c/[slug]` (dashboard), `/c/[slug]/discussions`
  (`?section=`), `/c/[slug]/discussions/[id]`, `/c/[slug]/definitions/[id]`.
- **Components:** new `<ClauseRef>` and `<Requirement>`; the sheet uses Bits UI
  `Dialog`.
- **Content:** `standard/rcos-core/0.1/annotations.yaml` (Compass's own file,
  not in the upstream manifest); `scripts/check-standard.mjs`.
- **Overlap with `provenance-ui`** (not started): its "discussions on this
  definition by `definitionId` *or* by a clause it answers" should match by
  `section_key` too. Whichever lands second adjusts; this change does not edit
  that proposal.
- **Upstream, not here:** eleven sections own clauses that describe their whole
  artifact or layer (`design.md` §5). That is the RCOS-website generator's
  ownership data; it is listed for a fix there and re-vendor, not patched here.

## Context

The Path (`src/lib/server/services/path.ts`) lists authored sections not yet
answered. For each it sets `clauseKey = ownedClauses[0]` — the first *countable*
clause the section owns — and `discussionId` = an open thread whose `clause_key`
is any of those clauses. The Path row links to
`/discussions?clause=<key>&title=<question>`; `openDiscussion` stores the clause
key; the freeze (`decisions.ts`, the `FreezeTarget` resolution) and evidence
confirmation (`evidence.ts`) both find the section through `clause.owner`.

Measured against `standard/rcos-core/0.1/` (94 authored sections):

| | sections |
|---|---|
| own ≥1 countable clause | 66 |
| own none — `clauseKey` is null, "Start discussion" opens a blank form | 28 |
| own clauses that describe their whole artifact or layer | 11 |

`sections.yaml` gives every section `clauseRefs` (owned ∪ referenced; checked:
every owned ref is in it), `whyItMatters`, `whatToDefine` and `placeholders`, in
five locales. There is no "what not to define" text anywhere in the vendored
standard. `annotations.yaml` is Compass's own file and is not in
`upstream-manifest.json`, so editing it is not a re-vendor.

## Goals / Non-Goals

**Goals:**
- Every Path item can be started, discussed and frozen, and the freeze lands on
  the section the item is.
- Every Path item and every discussion shows the RCOS text it answers.
- Every question covers what its section's clauses require.

**Non-Goals:**
- Changing which section owns which clause. That is upstream data (§5).
- Changing readiness or compliance arithmetic. A section with no countable
  clause still moves no readiness number.
- Reordering the Path. Effort and `dependsOn` are untouched.
- Replacing every existing place that prints a ref with `<ClauseRef>`. New
  and touched call sites use it; the rest is a follow-up.

## Decisions

### 1. The thread names the section; the clause stays as it is

Add `discussion.section_key` (nullable). A thread started from the Path stores
the section, and still stores the section's first countable clause in
`clause_key` when there is one.

- *Alternative: a `discussion_clause` join table* — rejected. A community
  answers a section; the clauses are derived from it and would have to be kept
  in step with the vendored standard in two places.
- *Alternative: replace `clause_key` with `section_key`* — rejected. The
  discussion list, search index, dashboard and freeze modal all read
  `clause_key`, and threads opened by typing a ref into the form have no
  section. Keeping both means no existing row or reader changes.
- *No backfill.* The standard is not in the database, so a SQL migration cannot
  compute `clause.owner`. Readers use `sectionOf(thread) = thread.sectionKey ??
  owner(thread.clauseKey)`, which is exactly today's behaviour for old rows.

### 2. Freeze and Path resolve through `sectionOf`

- Freeze target: `definitionId` → that definition (unchanged); else
  `sectionOf(thread)`; if neither yields an authored section, the existing 409.
  The decision's clauses are `clausesOwnedBy(section)` — possibly empty. An
  empty list writes no `decision_clause` rows and no coverage; the definition is
  adopted, the section is answered, the artifact moves toward complete.
- Path thread match: build `openBySection` from `sectionOf` over open threads,
  instead of `openThreads` keyed by clause. Two items that *reference* the same
  clause (voluntary exit owns §3.6.4, forced exit references it) no longer see
  one thread as both of theirs.
- Ordering's "an open discussion raises it" input (`ordering.ts`) counts
  threads by `sectionOf` too. For every thread opened before this change that
  is the owner of its clause — what the input already used — so no existing
  order moves; a thread on a section owning no clause now counts for it.
- `openDiscussion` gains `{ kind: 'section', sectionKey }`: the section must be
  an authored section of the community's active standard, else 400 (typed input,
  refused where it was typed — as the clause case does today).

### 3. What a Path item cites

`PathItem` replaces `clauseKey` with:

```ts
cites: { key: string; ref: string; owned: boolean }[]  // owned first, then referenced, each in ref order
start: { sectionKey: string; clauseKey: string | null }
```

The row prints owned refs plainly and referenced ones after "related", through
`<ClauseRef>`, each linking to `links.standard(slug)#clause-<ref>` (the anchor
the standard browser already renders). All clauses are shown, including owned
MAY and INFORMATIVE ones: the sheet carries the normativity; the row is a
pointer, not the text.

### 4. The question audit

Each question was read against the section's owned clauses and `whatToDefine`.
Rewritten where the question is narrower than, or different from, what the
clauses require. Unlisted sections were checked and left alone.

| Section | Owns | Was | Becomes | Missing before |
|---|---|---|---|---|
| identity-constraints-register.active-identity-constraints | 2.4.1 | What do we require of people who live or take part here? | What non-negotiables shape how people take part, behave and govern here? | governance and ecological constraints |
| identity-constraints-register.conditions-for-change | 2.5.2 | How do these requirements change, and who decides? | How are our non-negotiables changed and ratified — and can every member always read the current version? | accessible, versioned |
| purpose-charter.secondary-purposes | 2.1.4 | What else do we do, that matters but is not the reason we exist? | What else do we pursue that matters — without competing with why we exist? | must not conflict with the primary purpose |
| exit-protocol.voluntary-exit | 3.6.1 · 3.6.2 · 3.6.4 | Can someone leave at any time — and what happens to their things? | How can someone leave whenever they choose — without being punished for it, or losing more than their membership? | non-punitive procedure, no loss of other rights; "their things" is §3.6.5 |
| exit-protocol.suspension | 3.7.2 · 3.7.3 | Can someone be paused rather than removed — for how long, and reviewed by whom? | Can someone be paused rather than removed — for how long, reviewed by whom, and never as a punishment in disguise? | not punitive, not indefinite |
| exit-protocol.asset-role-and-responsibility-separation | 3.6.5 | When someone leaves, who takes over their roles and how is money settled? | When someone leaves, what happens to their roles, tasks, access and anything they hold for us — agreed before anyone leaves? | assets and access; "prior to exit" |
| membership-agreement.member-rights | 3.4.1 · 3.4.3 | What can every member count on, that nobody can quietly take away? | What can each kind of member count on, in proportion to what we ask of them? | per membership state, symmetrical with obligations |
| membership-agreement.participation-and-contribution-expectations | 3.5.1–3.5.4 | What counts as contributing here, and how much is enough? | What counts as taking part, how much is enough, may someone send a stand-in — and what happens when someone stops? | substitution; non-participation trigger |
| membership-state-registry.defined-membership-states | 3.1.1–3.1.3 | What kinds of member are there here, and what can each of them do? | What kinds of member are there — at least applicant, trial, full and former — and what may and must each of them do? | the four required states; obligations |
| onboarding-protocol.admission-criteria | 3.2.3 · 3.2.4 | Who can join, and who decides? | Who can join, on which written criteria — so nobody becomes a member just by being around? | no informal or implicit membership |
| onboarding-protocol.trial-and-evaluation | 3.3.1–3.3.4 | How long is someone new on trial, and who says when it ends? | How long is someone new on trial, what are they judged on, who decides — and what happens if it does not work out? | criteria; failure path |
| onboarding-protocol.completion-record | 3.8.2 | How do we record that someone has finished joining? | How do we record that someone has finished joining — and can every member read the rules they agreed to? | L1 artifacts accessible and versioned (see §5) |
| authority-registry.registered-authorities | 4.3.1–4.3.5 | Who is allowed to decide what — and where does each person's authority stop? | Who may decide what, where does it stop, for how long — and who may act in an emergency? | term; temporary and emergency authority |
| decision-matrix.voting-principles | 4.2.1 · 4.2.3 | For each kind of decision, who gets a say and what counts as agreement? | For each kind of decision, who gets a say, what counts as agreement, who can block it, and how long does it stay open? | blocking/veto; time constraints |
| governance-protocol.safeguards-and-failure-modes | 4.6.1–4.6.3 | What stops decision-making quietly collecting in the same few hands? | What stops power collecting in a few hands, lets anyone challenge a decision safely, and forces a review when governance keeps failing? | challenge without retaliation; failure trigger |
| internal-economy-protocol.contribution-recognition-mechanism | 5.2.2 · 5.2.5 | How does a contribution actually get recognised, and by whom? | How does a contribution get recognised, who can contest it, and what does recognition unlock — never extra say? | contesting; effect; no governance influence |
| internal-economy-protocol.accumulation-constraints | 5.4.1–5.4.4 · 5.6.4 | What stops one person accumulating enough to steer everything? | What stops one person accumulating enough to steer everything — and how would we notice? | concentration indicators and review |
| treasury-ruleset.spending-authority | 5.3.3 · 5.7.1 | Who can spend how much without asking anyone, and who approves the rest? | Who can spend how much without asking, who approves the rest, and how is every spend recorded? | recordkeeping |
| accountability-protocol.sanction-and-repair-options | 6.4.1–6.4.3 · 6.4.5 · 6.4.6 · 6.6.3 | What can actually happen as a consequence — and what does repair look like? | What consequences can follow, how are they kept proportionate and open to appeal — and how does repair come before punishment? | proportionality; appeal; no informal exclusion |
| conflict-resolution-ladder.conflict-classification | 6.1.1–6.1.5 · 6.5.3 · 6.6.4 · 6.7.1 | What kinds of conflict do we have names for, so nobody has to invent one mid-argument? | What kinds of conflict do we have names for, so nobody invents one mid-argument — and which are safety-critical? | safety-critical class |
| conflict-resolution-ladder.safeguards | 6.3.1 · 6.3.3–6.3.5 · 6.6.2 | What changes when the two people in a conflict do not have equal power? | What changes when the people in a conflict do not have equal power — or when someone is not safe? | safety-critical protective actions |
| operations-manual.workload-boundaries | 7.4.1–7.4.4 · 7.7.3 | How much can we ask of one person before it is too much, and who gets to say so? | How much time, meeting and care can we ask of one person — and what happens when someone is overloaded? | meeting load; overload triggers review |
| operations-manual.documentation-locations-and-update-procedures | 7.3.1–7.3.3 · 7.8.1 | Where do we write things down, and how does anyone know they are reading the current version? | What do we write down, where, and who may read it — and can every decision be traced to who made it and how? | access and privacy; decision traceability |
| change-protocol.how-proposals-are-classified | 8.1.2 · 8.1.4 | How do we tell a small adjustment from a change to who we are? | How do we tell a small adjustment from a change to who we are — and a permanent change from an experiment? | permanent vs experiment |
| change-protocol.transition-and-migration | 8.5.2 | When a rule changes, what happens to the situations already running under the old one? | What extra care does a change that is hard to undo need — and what happens to what is already running under the old rule? | §8.5.2 is about irreversible changes, not transition |

Only the English question is annotated today (the Path renders it for every
locale); that stays as it is.

### 5. Upstream ownership, listed rather than patched

These sections own clauses that describe their whole artifact or layer, so
freezing the one section marks the whole requirement covered:

| Section | Owns clauses about |
|---|---|
| identity-constraints-register.conditions-for-change | 2.5.2 — every Layer 0 artifact |
| scope-declaration.in-scope-assets | 2.2.2 — assets *and* domains *and* activities |
| onboarding-protocol.completion-record | 3.8.2 — every Layer 1 artifact |
| governance-protocol.proposal-submission | 4.5.1 · 4.5.2 — the whole decision lifecycle |
| internal-economy-protocol.dispute-resolution-for-economic-records | 5.5.3 — the whole Internal Economy Protocol |
| treasury-ruleset.treasury-scope / .spending-authority | 5.5.4 / 5.7.1 — the whole Treasury Ruleset / Layer 3 |
| accountability-protocol.triggers | 6.5.4 — the whole Accountability Protocol |
| conflict-resolution-ladder.conflict-classification | 6.5.3 · 6.7.1 — the whole ladder / Layer 4 |
| meeting-templates.meeting-type-operations | 7.2.1–7.2.4 · 7.6.4 — every meeting type |
| operations-manual.documentation-locations-and-update-procedures | 7.8.1 — Layer 5 |
| change-protocol.how-changes-are-proposed | 8.6.3 · 8.8.1 — the whole Change Protocol / Layer 6 |

The fix belongs in the RCOS-website generator (an artifact-level disposition, or
ownership by the last section of the artifact) followed by a re-vendor. The
questions above are worded for the section, not for the artifact-wide clause.

### 6. The requirement sheet

One read, `requirementFor(view, sectionKey, locale)` in
`src/lib/server/services/requirement.ts`, returns:

```ts
{
  clauses: { key; ref; normativity; body; owned }[];      // clauseRefs, owned first
  whyItMatters: string | null;
  whatToDefine: string | null;
  notHere: { sectionKey; question; refs: string[] }[];    // derived, below
}
```

`notHere` is the sibling authored sections of the same artifact, then the owner
of each referenced-only clause if not already listed, each with its Path
question and owned refs. It is derived from the standard's own structure; it is
never prose Compass wrote. It is shown under the design's "What NOT to define
here" heading as "These belong to other sections:".

`<Requirement>` renders it: "The requirement" + `<HelpTip>`, each clause as a
quote with `<ClauseRef>` and its normativity, then *Why it matters*, *What to
define here*, *What NOT to define here* as `<details>`. The definition page's
left column becomes this component (same data, one more section).

On the discussion page the header prints the section's refs; each is an `<a>`
to the standard browser anchor (works with no JavaScript) whose click opens a
Bits UI `Dialog` styled as a sheet — right-hand, 420px, from 768px; full-width
from the bottom below it — scrolled to and marking the clicked clause. Bits UI
owns focus, escape and portalling.

- *Alternative: a server-opened panel via `?ref=`, as the freeze panel does* —
  rejected. The freeze panel is a form; this is reading, and the standard
  browser link is already the no-JS path.

### 7. Links

`links.startDiscussion(slug, { sectionKey, clauseKey }, title)` →
`/discussions?section=…&clause=…&title=…`. The new-discussion form carries
`section` as a hidden field when present, and the clause field is prefilled but
still editable. If the member changes the clause to one another section owns,
the section is dropped — the typed clause wins, as today.

## Risks / Trade-offs

- [A decision with no clauses reads oddly in the register] → The register and
  permalink print the section title and "No RCOS clause is answered here —
  completes <artifact>". Checked in the decision-register tests.
- [`sectionOf` diverges for a thread whose typed clause was later changed] →
  `section_key` is written only at open time, and only when the typed clause is
  empty or owned by that section; otherwise it is null and `clause.owner`
  decides, as today.
- [Question rewording confuses a community mid-discussion] → Thread titles are
  copied at open time and do not change; only the Path and dashboard wording
  moves.
- [Eleven over-broad owners keep overstating readiness] → Out of scope here,
  listed in §5 for the upstream fix.

## Migration Plan

One drizzle migration adding `discussion.section_key` and an index on
`(community_id, section_key)`. Runs at boot like every other. Rollback: the
column is nullable and unread by the previous release.

## Open Questions

- Should *What NOT to define here* eventually be real upstream prose per
  section, written in the RCOS templates? If so it replaces the derived list in
  the sheet; until then the derived list is what the standard supports.

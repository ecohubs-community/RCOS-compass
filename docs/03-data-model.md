---
status: draft for discussion
version: 0.1
date: 2026-08-31
relates_to: ../UI Spec — v0.1 (draft).md §3
---

# Data Model & Computation Rules

The UI spec §3 sketched the objects. This document makes them buildable: keys,
cardinality, state machines, and the arithmetic behind every number the product
shows. Anything a user sees as a number or a status is defined here exactly once.

---

## 1. Two ID schemes, and the mismatch we have to fix

**Finding (blocking, before any schema is written):** the RCOS Core spec numbers
clauses by document section — Layer 0 lives in §2, so its purpose clauses are
`2.1.1–2.1.5`. The mockups number them by layer — Layer 1 membership clauses
appear as `1.2.5`. Two incompatible schemes, both visible to users, both used in
places that quote them ("clause 3.6").

**Resolution — a clause reference is a triple, never a number:**

```
(standard_id, version, ref)   →   core@0.1 · 3.3.2
                                  permaculture@0.1 · 1.1.1
```

- `clause.standard_id` — `rcos-core`, or a module (`rcos-module-permaculture`).
  Modules number their clauses **from 1.1.1 too**, so a bare number is ambiguous
  the moment the first module exists.
- `clause.version` — `0.1`. The same `ref` in core 0.2 may point at different
  text; refs are only meaningful inside a version.
- `clause.ref` — the **document section number**, exactly as published
  (`2.1.1`, `5.3.5`). What members quote and what cross-references the public
  standard.
- `clause.layer` — `0..6`, derived from the chapter (§2→L0, §3→L1, §4→L2, §5→L3,
  §6→L4, §7→L5, §8→L6). Displayed as `Layer 1 · Membership`, never as a number
  prefix on the clause.
- `clause.key` — a stable slug (`membership.probation.duration`) that survives
  renumbering across versions. Foreign keys point at `(standard_id, version, key)`,
  never at `ref`.

One component, `<ClauseRef>`, renders every form. Nothing else formats a
reference. The mockups must be regenerated with document refs.

Getting this wrong now means every decision record in every community quotes
numbers that stop existing at RCOS v0.2 — and there is no way to fix it
retroactively, because the app cannot know which "1.2.3" a 2026 decision meant.

**The full versioning and module model, including guided migration between
standard versions, is `09-standards-versions-modules.md`.** This document assumes
it.

---

## 2. Standard (shared, read-only, versioned)

Authored as `standard/<standard_id>/<version>/*.yaml` and **materialised into
read-only database tables at boot** by an idempotent upsert keyed on
`(standard_id, version, key)`, with an in-memory cache on top for read paths.

Materialising matters: `clause_coverage`, `decision_clause` and `section` joins
all reference clause keys, and a foreign key that points at a YAML file in memory
is not a foreign key. Published versions are immutable — an upsert that would
change the text of a clause in an `active` version fails the boot rather than
silently rewriting what communities have already answered. Editing a published
clause means publishing a new version.

`standard_id` is `rcos-core` today and a module id later — the loader does not
care which.

```
standard           id 'rcos-core' | kind core|module | title | source_url
                   extends_layers[]   -- modules only (RCOS §9.1.2)
                   conflicts_with[]   -- e.g. permaculture ⟷ minimal-permaculture
standard_version   standard_id | version '0.1' | status active|superseded
                   | published_at | supersedes? | source_url | licence
layer              standard_id | version | n 0..6 | name | summary
clause             standard_id | version | key | ref | layer | normativity MUST|SHOULD|MAY
                   | disposition defined_by_section|satisfied_by_platform|not_a_definition
                   | text | why_it_matters | borders | feeds_artifact[] | depends_on[]
section            standard_id | version | key | artifact_key | title | clause_keys[] | order
                   | effort one_conversation|one_meeting|a_series
                   | prompts[] (what to define) | borders (what not to define here)
artifact           standard_id | version | key | title | layer | mandatory bool | section_keys[]
glossary_term      standard_id | version | key | term | definition
```

`section` is the atom users see (UI spec §1.1); `clause` is the compliance unit.
A section covers 1..n clauses; **a clause is covered by exactly one section**
(see §4). Effort tags and `depends_on` edges are the two things the published
templates do not carry and we must author (UI spec §6.3).

---

## 3. Tenant objects

```
community          id | slug | name | locale | timezone | created_at | status active|suspended|deleted
                   | interim_adoption_rule_id? | ordering_weights (json)
                   | ai_enabled | git_mirror_enabled | public_index_enabled   -- flags, all default off
                   | ai_provider_override? | publish_names_policy
                   | max_members? | storage_mb? | ai_monthly_tokens?   -- null = instance default
community_slug_redirect
                   id | old_slug UNIQUE | community_id | created_at | expires_at
                   -- a retired address keeps resolving for 90 days: a decision
                   -- reference pasted into a mailing list should not die because
                   -- a community changed its name. Offered only to someone who
                   -- would be let into the target, so the boundary still holds.
community_standard community_id | standard_id | version | status active|migrating|retired
                   | adopted_at | adoption_decision_id | retired_at?
                   | UNIQUE(community_id, standard_id)
                   -- exactly one active row of kind=core; modules post-MVP
membership         id | community_id | user_id | role steward|member   -- observer post-MVP
                   | is_owner bool          -- exactly one per community; transfer + delete only
                   | rcos_state applicant|trial|full|exited|suspended   -- CONTENT, not access
                   | display_name | joined_at | ended_at?
user               better-auth table | email | email_verified | name | locale
invitation         id | community_id | email | role steward|member   -- never 'owner'
                   | token_hash | expires_at | accepted_at? | invited_by

definition         id | community_id | scope standard|local
                   | community_standard_id? | section_key?     -- scope=standard
                   | title? | layer? | purpose?                -- scope=local
                   | attach_kind rcos_artifact|community_artifact       -- scope=local
                   | attach_rcos_artifact_key? | attach_community_artifact_id?
                   | adopted_version_id? | open_proposal_id? | review_due_at?
                   | provisional bool
                   | PARTIAL UNIQUE(community_standard_id, section_key) WHERE section_key IS NOT NULL
                   | CHECK (scope='standard') = (section_key IS NOT NULL)
                   | CHECK exactly one attach_* is set when scope='local'
community_artifact id | community_id | title | layer? | description | order
                   | kind default|custom   -- every community gets one 'Community Agreements'
standard_feedback  id | community_id | definition_id? | clause_key? | standard_id | version
                   | kind gap|ambiguity|conflict|suggestion | body | created_by | created_at
                   | shared_upstream bool  -- opt-in, never automatic
definition_draft   definition_id | body | plain_language | type | updated_by | updated_at
                   | edit_token   -- optimistic concurrency; one live draft per definition
definition_version id | definition_id | n | body | plain_language | type enforceable|interpretive|expressive
                   | author_id | created_at | ai_assisted bool | ai_task? | linter_result (json)
                   | adopted_at? | decision_id? | supersedes_version_id?
clause_coverage    community_id | community_standard_id | clause_key | definition_id
                   | derived, rebuilt on adopt
                   | UNIQUE(community_standard_id, clause_key)

decision           id | community_id | seq | ref 'DEC-2026-014' | title | type constitutional|strategic|operational
                   | layer | mechanism | threshold | tally_present | tally_for | tally_against
                   | rationale | proposal_text | decided_at | review_due_at | source online|offline
                   | provisional bool | status active|superseded|withdrawn
                   | superseded_by_id? | idempotency_key | recorded_by | UNIQUE(community_id, seq)
decision_attendee  decision_id | membership_id? | external_name? | consented_to_publish bool
decision_clause    decision_id | standard_id | version | ref | clause_key
                   -- ref stored AS QUOTED at decision time; never rewritten by a migration
discussion         id | community_id | definition_id? | clause_key? | title | status
                   | opened_by | opened_at | last_activity_at | frozen_decision_id?
                   | origin clause|ai_session|offline   -- hook for the post-MVP Ask AI flow
post               id | discussion_id | author_id | body | created_at | kind message|proposal|offline_summary
                   | proposal_version n? | edited_at?
objection          id | proposal_post_id | raised_by | reason | raised_at
                   | state open|withdrawn|addressed|overruled
                   | resolved_by? | resolved_at? | resolution_note?
consent_round      id | community_id | proposal_post_id | opened_by | opened_at
                   | closes_at | status open|closed|cancelled
                   | eligibility all_members|selected  -- see §5
consent_eligible   round_id | membership_id   -- snapshot, written when the round opens
consent_response   round_id | membership_id | value consent|objection|abstain
                   | objection_id? | responded_at | UNIQUE(round_id, membership_id)
document           id | community_id | filename | mime | bytes | sha256 | storage_key
                   | uploaded_by | status uploaded|extracting|extracted|reference_only|failed
passage            id | document_id | page | ordinal | text | text_hash | bbox?
evidence           id | community_id | passage_id | clause_key | state suggested|confirmed|dismissed|stale
                   | confidence | suggested_by ai|human | confirmed_by? | confirmed_at?
transparency_exception id | community_id | subject_type | subject_id | justification
                   | expires_at | decision_id | created_by
notification       id | community_id | recipient_membership_id | kind | subject_type | subject_id
                   | created_at | read_at?
                   -- one row per recipient, not an event joined to a read table:
                   -- a member's list is then one indexed read and "mark all read"
                   -- is one update. Never written for the actor's own action.
change_log         id | community_id | at | actor_id | kind | subject_type | subject_id | summary | payload(json)  -- append-only
learning_entry     id | community_id | … (Layer 6 log)
audit_event        id | at | actor_id? | actor_email | community_id? | action | target | ip | user_agent | meta(json)  -- append-only, platform-wide
ai_call            id | community_id | actor_id | task | model | tokens_in | tokens_out | ms | input_sha256 | ok
ai_usage           community_id | actor_id | period_day | period_month | tasks | tokens
                   -- rolled up for the per-user limits in 04-security.md §5.3
self_audit         id | community_id | run_by | run_at | compliant bool
                   | snapshot (json)  -- missing artifacts, uncovered clauses, provisional,
                   --                    stale reviews, unresolved objections, exceptions,
                   --                    readiness per layer. Immutable; the public index
                   --                    cites its date (RCOS §C.5)
```

---

## 3a. Local definitions — scope, and what it changes

A definition either answers a section of a standard (`scope = standard`) or it is
the community's own rule (`scope = local`). See UI spec §1.4b for why.

**Everything the lifecycle gives a standard definition, a local one gets**:
versions, drafts with `edit_token`, discussions, proposals, objections, consent
rounds, freeze, decision records, review dates, linter results, glossary entries,
visibility and transparency exceptions, search, export, the git mirror.

**What differs, exhaustively:**

| | `standard` | `local` |
|---|---|---|
| `section_key` | required | null |
| `title` | from the section | authored by the community |
| `layer` | from the section | declared by the author (may be null → "unassigned") |
| Attaches to | its artifact, via the section | exactly one of: an RCOS artifact, or a community artifact |
| Left column of the detail screen | the verbatim clause | the community's own `purpose` — *why we made this rule* (§3c) |
| In the glossary and search | yes | **yes** — same index, same panel |
| Enters `clause_coverage` | yes | **never** |
| Enters readiness / compliance | yes (core only) | **never, in either direction** |
| Completes an artifact | yes | **no** — see §3b |
| Appears in the Path's ordered gaps | yes | only via a manual override |
| Appears in exports and the public index | yes | yes, **labelled as a community addition** |

The partial unique index matters: `UNIQUE(community_standard_id, section_key)`
must be `WHERE section_key IS NOT NULL`, or a community could hold only one local
definition. Both SQLite and Postgres support partial indexes, so this survives
the migration in `00-architecture.md` §5.

### 3a.1 The detail screen has no left column for a local definition

The hero screen is a triad: *what the standard asks / what we said / how we got
here*. A local definition has no standard asking anything, and an empty column
would read as a missing feature rather than a deliberate absence.

So for `scope = local` the left column becomes **"Why we made this rule"** — a
short community-authored `purpose` field, prompted at creation with the linter's
own kill question (*"what breaks if we delete this?"*), plus the adopted
definitions for the declared layer, so an author can see what they are writing
next to. Same three columns, same widths, same provenance on the right; only the
left column's source changes.

That `purpose` field is not decoration: it is the thing a member reads in three
years when nobody remembers why the rule exists, and it is what the AI-assist
conflict check compares against.

## 3b. Artifact completeness with local content

```
artifact_complete(a) := every AUTHORED section of a with scope='standard'
                        has an adopted definition
```

**Authored** is the section disposition the standard data carries
(`docs/12-clause-ownership-report.md`). Of RCOS-Core 0.1's 118 sections, 94 are
authored; the other 24 are not things a community writes, and counting them would
put that much busywork between a community and compliance:

- **19 `filled_from_decision`** — every Ratification Record. Compass writes it
  from the decision that adopted the artifact, at freeze time, so the record and
  the register cannot disagree. It is present in exports and on the public index;
  it is simply never asked for.
- **4 `instance_record`** — a learning-log entry, two version-history lines, an
  experiment outcome. These are the shape of an entry that recurs, one per event.
- **1 `derived`** — the Role Registry's summary table, generated from the roles
  defined below it.

An artifact with no authored section at all would be complete on creation, which
would read as work that never happened; `scripts/check-standard.mjs` refuses that
shape.

Local definitions attached to an RCOS artifact are rendered under it and are
**excluded from its completeness computation and its percentage**. They can
neither complete an artifact nor block one — a community with a hundred local
additions and one unanswered RCOS section is still incomplete, and rightly so.

**If a module later covers what a community defined locally** — a community
writes its own composting rules, then adopts the permaculture module which has a
section for exactly that — the local definition is **not** silently converted.
The module section appears as a new gap, and the local definition offers
*"answer this with our existing rule"*, which copies its text into a draft for the
module section and leaves the local one in place until a freeze supersedes it.
Automatic promotion would change what a community is committed to without anyone
deciding. Post-MVP, but the shape is fixed now so the data does not have to move.

`community_artifact` rows never enter compliance at all. They are grouped
separately on the Artifacts page and in the export bundle, under a heading that
says what they are.

**Labelling is a correctness requirement, not decoration.** Every rendering of a
local definition outside the app's own list views — export, public index, PDF,
git mirror, onboarding pack — carries *"community addition — not required by
RCOS-Core v0.1"*. Omitting local content from an export would misrepresent how
the community governs itself; including it unlabelled would let an outsider read
a house rule as a standard requirement. Both failures are tested
(`06-testing-strategy.md` §6.4–6.5).

## 4. Cardinality: the open question §10.5, resolved

**One owning definition per clause, plus non-owning references.**

- `clause_coverage` has a unique key on `(community_standard_id, clause_key)` —
  the rule holds *within a standard at a version*. Exit rules touch Layer 1 and
  Layer 4; the Layer 1 section *owns* the clauses, and the Layer 4 section
  carries a `references` edge that renders as a cross-link and contributes
  nothing to readiness.
- **Concretely:** RCOS 3.6.5 ("asset, role and responsibility separation MUST be
  defined prior to exit") is owned by the *Exit & separation* section. The
  Accountability Protocol's separation section links to it, shows its current
  text, and is notified when it changes — but the clause is counted once, in one
  place, and an auditor asking "where did you define this?" gets exactly one
  answer.
- A module section may **reference** a core clause. It may never **own** one.
- **The published templates do not yet satisfy this rule**: 57 clauses are
  claimed by more than one section, from the harmless (three *In-Scope* sections
  all citing 2.2.1) to the genuinely contested (3.1.2 claimed by *Membership
  Agreement*, *Onboarding Protocol* and *Membership State Registry*). Arbitrating
  those 57 into one `owner` plus `references` is a P1 task with a known size, and
  the CI check keeps it that way.
- Rationale: readiness and compliance must be countable without double-counting,
  and "which definition answers this clause" must have one answer when an auditor
  asks.
- Consequence for content authoring: every one of the 187 MUST clauses must be
  assigned to exactly one section in `standard/`. A CI check fails the build on
  an unassigned or doubly-assigned clause. This is the single most important
  invariant in the content pipeline.

---

## 5. State machines

### Definition status is **derived, never stored**

Storing it guarantees drift (the mockups already show a definition that is
simultaneously *In discussion*, *Provisional*, and has an adopted v2 with a draft v3).

```
status(definition) =
  needs_review   if adopted_version && review_due_at < now
  in_vote        if open_proposal has an open vote round
  in_discussion  if an open discussion exists on it
  drafting       if a non-adopted version exists
  adopted        if adopted_version_id is set
  not_started    otherwise
```

Order matters: the first matching rule wins. `provisional` and `ai_assisted` are
**modifiers**, not statuses — they render as badges alongside. The decision
register table in the mockup lists `Provisional` in the Status column; that is
the same category error and must be split into a status column and a flag.

### Decision status

`active → superseded` (a later decision on the same definition supersedes it) or
`active → withdrawn` (recorded in error; the row stays, a correcting entry is
added). Decisions are **never deleted or edited**. A correction is a new decision
that names what it corrects. `provisional` is a flag that clears on ratification,
recording the ratifying decision id.

### Objections and consent rounds

An objection is an **object with a reason and a lifecycle**, not a button press.
`open → withdrawn | addressed | overruled`, each resolution carrying who resolved
it and how. Under a consent mechanism an open objection blocks — but the app does
not enforce the community's own threshold; it records the state and **refuses to
hide it**. Freezing with unresolved objections is possible (the community's rule
may allow it), and when it happens the decision permanently records
*"frozen with 1 unresolved objection"*, visible in the register and on the
decision permalink. Governance tools that let dissent evaporate at the moment of
recording are how communities end up arguing about what was agreed.

A consent round is a time-boxed collection of responses against one proposal. It
closes at `closes_at` or when everyone eligible has responded; the tally feeds the
freeze form pre-filled, and the freeze is still a human act.

**Who is eligible is a snapshot, not a query.** The app cannot know a community's
own eligibility rule — many communities give trial members voice but not a block,
and that lives in *their* Membership Charter, not in ours. So:

- The default is every active membership at the moment the round opens.
- The steward opening the round may deselect people, with the round recording
  that it was a `selected` set.
- **The eligible list is written to `consent_eligible` when the round opens** and
  never recomputed. Someone joining mid-round does not silently become eligible;
  someone leaving does not retroactively shrink the denominator. A tally whose
  denominator moves after the fact is worse than no tally.
- `rcos_state` is shown next to each name as *information* for the person opening
  the round — never as an automatic exclusion. Membership state is content the
  community governs; it must not quietly authorise anything
  (`04-security.md` §1).

### Evidence

`suggested → confirmed | dismissed`. Confirmed evidence goes **stale** when its
document is replaced or re-extracted and the passage's `text_hash` no longer
matches — it is not silently re-pointed. Stale evidence surfaces in *Needs
attention* and does not count toward "you already have language for N of 187".

---

## 6. Decision references (`DEC-2026-014`)

- `seq` is a **per-community gapless counter** allocated inside the freeze
  transaction (`SELECT max(seq)+1 … FOR UPDATE` semantics; in SQLite the write
  transaction serialises this for free). Drafts never consume a number.
- `ref = 'DEC-' || year || '-' || zeroPad(seq, 3)` where `year` is the freeze date
  **in the community's timezone** — hence `community.timezone` is required, not
  optional.
- Refs are permanent and quotable, and every decision has a short permalink
  `/c/{slug}/d/{ref}`.
- Freeze carries an idempotency key (`01-server-client-contract.md` §1); a
  duplicate submit returns the existing decision rather than burning a number.

---

## 7. Readiness and compliance — the exact arithmetic

Two numbers, two audiences (UI spec §1.4). Both computed **server-side only**,
and both computed **once per adopted standard** — core produces the compliance
claim; each module produces its own separate figure that is never added to it
(RCOS §10.1.5; see `09-standards-versions-modules.md` §3).

**Only `scope = standard` definitions and clauses with
`disposition = defined_by_section` are counted.** Local definitions (§3a) are
outside this arithmetic entirely.

**Only clauses with `disposition = defined_by_section` are counted.** The other
two — `satisfied_by_platform` (the app's versioning, accessibility and
ratification records answer it) and `not_a_definition` (a rule about the standard
or about compliance itself) — are shown in the standard browser with an
explanation and excluded from every denominator. Counting them would make 100%
unreachable by construction; there are 12 such MUST clauses in core 0.1 alone
(`09-standards-versions-modules.md` §5.3).

**A clause is `satisfied`** when its owning definition has an adopted version.
Being past its review date does **not** unsatisfy it — the rule exists, it is
merely overdue for a look. Precisely:

```
satisfied(clause)   := coverage exists ∧ definition.adopted_version_id ≠ null
stale(clause)       := satisfied ∧ definition.review_due_at < now
provisional(clause) := satisfied ∧ definition.provisional
```

**Readiness (inward, a percentage):**

```
countable(c)         := c.normativity = MUST ∧ c.disposition = defined_by_section
readiness(layer)     = satisfied countable clauses in layer / countable clauses in layer
readiness(community) = satisfied countable clauses / countable clauses
```

The denominator is **computed from the loaded standard, never hard-coded.** The
"187 MUST clauses" figure in the product spec is close but not exact (a direct
count of core 0.1 gives 185 MUST clauses across Layers 0–6, of which 12 are not
`defined_by_section`), and a number that drifts from the data is the kind of
small dishonesty this product cannot afford. Print it from the pipeline.

SHOULD and MAY clauses are shown as separate counts and never enter the
percentage — otherwise a community can raise its number by answering optional
things, which is exactly the incentive RCOS exists to remove. Provisional
definitions **do** count toward readiness (they represent real work) and are
labelled as such.

**Compliance (outward, binary, §10.1.1):**

```
compliant := every mandatory artifact is complete
           ∧ no definition satisfying a MUST clause is provisional
           ∧ no clause is uncovered
artifact_complete := every section of the artifact has an adopted definition
```

Review-overdue does not break compliance (the artifact exists), but the public
index shows `n definitions past review` under the compliance statement, because
§10.3.4 requires known problems to be visible. When compliance flips from true to
false, the app **withdraws the published claim automatically** and writes a
change-log entry naming the cause — the §10.3.4 requirement, implemented.

**No percentage is ever rendered on a public page.** Enforced by a test that
crawls every route under `(public)` and fails on a `%` next to the word
compliant, and by keeping readiness out of the public loaders' return shape.

---

## 8. Provisional mode and the ratification sweep (UI spec §1.5)

- On setup the community records an **interim adoption rule** as a real
  `definition`-shaped record with its own decision. Not a settings string.
- Every freeze while `Decision Matrix` is incomplete sets `provisional = true` on
  both the decision and the definition, and the freeze modal says so (the mockup
  already does).
- When the Decision Matrix artifact becomes complete, the app raises a
  **ratification sweep**: a list of every provisional definition, each ratified by
  a real decision through the now-adopted path. Ratification creates a *new*
  decision that references the provisional one; it does not mutate history.
- Compliance is unreachable while any MUST-satisfying definition is provisional.
  That is the integrity guard that keeps provisional mode from becoming a
  loophole.

---

## 9. Visibility enforcement (UI spec §1.6)

`visibility ∈ member | world | restricted` on definitions, decisions, documents,
and artifacts. Enforcement, not just display:

- **Every read path takes visibility as a query filter**, including search
  indexing, AI context assembly, exports, and the git mirror. There is one
  `visibleTo(ctx)` helper and a test that every list service uses it.
- `restricted` requires an unexpired `transparency_exception` row. A nightly job
  expires them and reverts the subject to `member`, writing a change-log entry.
- `world` requires a decision record — publishing is a governance act.
- **Publishing does not publish member names.** `community.publish_names_policy`
  defaults to `roles_and_counts` ("consent, 9 of 11 present"); publishing
  individual attendee names requires per-attendee `consented_to_publish`. The
  mockup's "Attributed to the 11 people present" is correct *inside* the
  community and must not be the default outward.

---

## 10. Personal data, erasure, and the append-only register

The register is append-only; GDPR erasure is a right. Both hold, this way:

- Decision records reference `membership_id`, never a denormalised name.
- Erasure replaces the user's profile with a tombstone and renders historical
  attributions as `Former member (M-0142)`. The governance record — who was
  present, what was decided — survives, because a decision register that can be
  silently unmade is worthless.
- Free-text bodies that happen to contain a name are handled by a documented
  **correction** flow (a new version), not by editing history.
- This tension, and its resolution, belongs in the privacy policy verbatim; it is
  the kind of thing a community will ask about before adopting the tool.

---

## 11. Indexes that are not optional

`(community_id, …)` first on every tenant table. Specifically:
`definition(community_id, section_key)` unique ·
`clause_coverage(community_id, clause_key)` unique ·
`decision(community_id, seq)` unique · `decision(community_id, decided_at desc)` ·
`discussion(community_id, last_activity_at desc)` ·
`evidence(community_id, clause_key)` · `audit_event(at desc)` ·
`ai_call(community_id, created_at)`. FTS5 virtual tables for definitions,
decisions, and passages, each carrying `community_id` and `visibility` as
filterable columns.

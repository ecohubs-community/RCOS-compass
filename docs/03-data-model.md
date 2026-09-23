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
                   | claim_compliant?   -- the outward claim at the last claim check; null until
                   --                      the first, which records silently (notifications)
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
                   | email_enabled bool (default true) | digest_day 0–6 (default 1, Monday)
                   | last_digest_at?   -- email preferences are per membership: a person in two
                   --                     communities may want one weekly and the other never
user               better-auth table | email | email_verified | name | locale | time_zone?
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
                   | current_proposal_post_id?  -- the version the community is being ASKED about
                   -- Named, not derived. It was `max(proposal_version)`, which made writing a
                   -- version the only thing that could move the question and made that move
                   -- irreversible: nine of twenty-seven consent to v3, somebody posts v4, and
                   -- the other eighteen can never answer v3 again. Writing a version still
                   -- moves it forward; a steward (`proposal.set_current`) can move it back,
                   -- which reopens that version's superseded round with its own eligibility
                   -- snapshot. No FK, like frozen_decision_id: post.discussion_id already
                   -- cascades from here, so a constraint pointing back is a cycle.
                   | origin clause|ai_session|offline   -- hook for the post-MVP Ask AI flow
post               id | discussion_id | author_id | body | created_at | kind message|proposal|offline_summary
                   | proposal_version n? | edited_at?
objection          id | proposal_post_id | raised_by | reason | raised_at
                   | state open|withdrawn|addressed|overruled
                   | resolved_by? | resolved_at? | resolution_note?
consent_round      id | community_id | proposal_post_id | opened_by | opened_at
                   | closes_at | status open|closed|cancelled|superseded
                   -- `superseded` is the only closure that can be undone, and only while the
                   -- round could still be answered: a deadline that has since passed, or a
                   -- round everybody answered, would be closed again by the next read.
                   | eligibility all_members|selected  -- see §5
consent_eligible   round_id | membership_id   -- snapshot, written when the round opens
consent_response   round_id | membership_id | value consent|objection|abstain
                   | objection_id? | responded_at | UNIQUE(round_id, membership_id)
document           id | community_id | filename | mime | bytes | sha256 | storage_key
                   | uploaded_by | status uploaded|extracting|extracted|reference_only|failed
                   | extractor_version?  — reader version; below current re-reads at boot
                   | scan_status none|queued|running|stopped|complete | scan_detail? | scan_actor? | scan_claim?
                   | scan_heartbeat_at? | content_generation | mapping_done_at? | mapping_done_by?
                   — always the *current* file; earlier files are document_file_version rows
document_file_version id | document_id | community_id | filename | mime | bytes | sha256
                   | storage_key | uploaded_by? | uploaded_at | superseded_by? | superseded_at
passage            id | document_id | page | ordinal | kind heading|paragraph | text | text_hash | bbox?
                   | scanned_at?  — when a scan sent it to a model; never sent twice
                   — bbox: JSON [{x,y,w,h,start,end}] line boxes in unrotated PDF
                     user space, start/end offsets into text; null for pageless formats
evidence           id | community_id | passage_id? | document_id? | clause_key
                   | state suggested|confirmed|dismissed|stale | confidence | reason?
                   | excerpt_start? | excerpt_end? | suggested_by ai|human | confirmed_by? | confirmed_at?
                   — document_id outlives the passage, so stale evidence knows which file it was about
transparency_exception id | community_id | subject_type | subject_id | audience | justification
                   | expires_at | expired_at? | renews_id? | decision_id | created_by
                   -- `audience` was missing from this sketch and is named in UI
                   -- spec §1.6: without it "restricted" has no defined reader and
                   -- "a member sees it only if they may" is undefined. P6 added it.
notification       id | community_id | recipient_membership_id | kind | subject_type | subject_id
                   | summary | params(json)? | created_at | read_at?
                   -- one row per recipient, not an event joined to a read table:
                   -- a member's list is then one indexed read and "mark all read"
                   -- is one update. Never written for the actor's own action.
                   -- `params` holds the values the sentence is built from when shown
                   -- (a title, a filename, a count, a membership id for a person —
                   -- never a name or address), so it reads in the community's
                   -- current language; `summary` is the English fallback.
                   -- Replies collapse: an unread `discussion.reply` for the same
                   -- discussion is counted up (params.count + 1, created_at = now)
                   -- instead of adding a row; a read one is never reopened.
                   -- Written only for current members of the community, in the
                   -- transaction of the act that caused it. No clean-up job: a
                   -- list shows the latest 200, the count covers every row.
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
After a replacement, restore or re-read, stale evidence whose quote still hashes
to a current passage of the same document is offered for **re-confirmation** —
one click, never automatic. `reason` is the model's one-sentence account of what
the passage covers (rendered as text, never markdown); `confidence` is stored
and no screen shows it. `excerpt_start`/`excerpt_end` are offsets into the
passage text, validated `0 ≤ start < end ≤ length`.

### Scans and the mapping state

A scan is started by a member (`startScan`, charged to them) and runs as a chain
of `document.scan` jobs, twelve paragraphs a batch:

`none → queued → running → complete | stopped`. The claim is one conditional
update: it succeeds only when no scan is live or the live one has **stalled**
(no heartbeat for 10 minutes — a killed worker). Each claim writes a fresh `scan_claim` id its
jobs carry, so continuing a stalled scan supersedes the old job chain rather than
running beside it; a re-read resets the scan and the done mark, since none of the
new paragraphs has been read. Every batch writes inside a
transaction that re-checks `content_generation` and `scan_status = running`, so a
replace, restore, delete or re-read that bumped the generation makes the old scan
write nothing. A refused budget, unavailable AI or unexpected error records
`stopped` with a sentence; a stopped scan is continued, and only unread
paragraphs are sent.

The **mapping state** a document shows is derived, never stored
(`services/mapping-state.ts`, first match wins): *Reading* (uploaded/extracting),
*Couldn't be read* (failed), *Can't be scanned* (reference_only), *Scanning*
(queued/running, not stalled), *Not scanned* (nothing identified, no scan),
*Not governance* (nothing identified, scan complete), *Mapped* (something
identified, nothing open, and the scan complete or `mapping_done_at` set),
otherwise *Mapping in progress*. *Identified* counts paragraphs with non-stale
evidence; *open* counts those with a suggestion. **Mark mapping as done** sets
`mapping_done_at`; a new scan, a replace and a restore clear it.

### Versions

Replacing a file keeps the earlier one as a `document_file_version` row and its
file on disk; the document row takes the new file, its passages are re-read,
its evidence goes stale and its scan resets. Restoring swaps a version back with
no bytes copied. Versions count against the storage ceiling; only a steward
deletes one. The purge job sweeps files no document or version references.

---

### Time: three rules (`local-time`)

1. **A moment** — something happened, or will happen, at an instant — is stored as
   UTC epoch milliseconds (`integer … mode: 'timestamp_ms'`, every `*_at` column;
   `tests/unit/time-zone.test.ts` refuses a text date) and **shown in the viewer's
   zone**: `user.time_zone`, else `community.timezone`, else UTC
   (`$lib/time/zone.ts#timeZoneFor`).
2. **A calendar date a community sets** (a review date) is stored as the start of
   that day in the **community's** zone, and shown in the community's zone, so it
   is the same date to every member wherever they are.
3. **A community's own periods** — a decision reference's year, an AI budget day —
   are computed in the community's zone, as they always were.

`user.time_zone` (IANA, nullable) is reported by the browser the first time a
signed-in person loads a page without one, is never overwritten by that report
again, and is changed on the account page. It is erased with the account.
Archival exports write `YYYY-MM-DD` on the community's calendar
(`$lib/time/format.ts#isoDateIn`); machine-read dates (sitemaps, JSON, filenames)
stay ISO UTC.

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
- **Refs are guessable, and that is fine only because every ref-addressed query
  filters by community.** Being per-community and sequential, another community's
  `DEC-2026-001` is a string anyone can type — so `getDecisionByRef` and
  `decisionDetail` are registered in `services/registry.ts` under a `decisionRef`
  subject, and the cross-tenant suite hands each of them a neighbour's real
  reference. An id at least has to be stolen; a reference only has to be
  imagined.

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
and artifacts — except that an uploaded **document is never `world`**
(`document-paragraphs`): the publishing service takes only the `Publishable`
kinds (definition, decision, artifact), with a runtime guard for callers the
compiler never saw. Documents stay restrictable. Enforcement, not just display:

- **Every read path takes visibility as a query filter**, including search
  indexing, AI context assembly, exports, and the git mirror. There is one
  `visibleTo(audience)` helper and a registry — `tests/support/read-paths.ts` —
  that a test walks, so a read service added without an entry fails the suite.

  It takes an **audience, not a `Ctx`**: `Ctx` is user, community and membership,
  and an anonymous reader has none of them. The shortcut anybody reaches for is a
  `Ctx` with a placeholder user, which satisfies `requirePermission(ctx,
  'community.read')` and would hand an anonymous visitor every read path in the
  product — so the type makes it unrepresentable. A third `scoped` variant states
  its levels outright, for background jobs like the mirror that have no reader at
  all and must not borrow somebody's role.
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
`ai_call(community_id, created_at)`.

`path_weights` has a **partial** unique index on `(community_id) where active =
1`: one live ordering per community, enforced where it cannot be forgotten,
with the superseded rows sitting beside it. `path_override` is unique on
`(community_id, section_key)`.

**One FTS5 virtual table, not three.** `search_document` holds definitions,
decisions, discussion titles and document passages, with `community_id`,
`kind`, `subject_id` and `ref` as stored `UNINDEXED` columns. `community_id` is
inside the query rather than applied to the results — a search that fetches
across communities and narrows afterwards is one refactor away from not
narrowing. **Clause text is not in it**: the standard is identical for every
community, so indexing it per tenant would put non-tenant data inside the
structure whose whole discipline is tenant isolation. Clauses are matched
against the loaded standard in memory and merged into the result.

**Decision bodies are indexed, not only titles and rationales.** The water-pump
question is answered by the text a community adopted — *"any spend over €500
needs a consent decision"* — which lives in `proposal_text`; a title reading
"Spending authority" matches nothing a member actually types. The cost is real:
`proposal_text` is the longest column in the table and makes relevance noisier,
so `bm25` weights titles eight times bodies. The exit criteria are the arbiter,
not an opinion about relevance.

**An override survives a weights change and says it might be stale.**
`path_override.weights_id_at_placement` records which ordering was live when
somebody placed an item. Three options were open — drop the override, keep it
silently, keep it and say so. Keeping it silently is the trap: the community's
own instruction disappearing because they moved a slider is the worst of the
three, and dropping it makes a deliberate act evaporate. So the row survives,
the item carries a note that the ordering moved underneath it, and it offers to
release. The community decides.

---

## 12. What the database enforces, and one thing it does not

Three rules about definitions are held by the database itself, because they are
the ones an application bug would otherwise break quietly:

- `definition_section_idx` — unique on `(community_standard_id, section_key)`
  **where `section_key is not null`**, so a community cannot answer one section
  twice while local definitions stay unconstrained.
- `definition_scope_section_ck` — `(scope = 'standard') = (section_key is not
  null)`, so scope and attachment can never disagree.
- `definition_local_attach_ck` — exactly one `attach_*` key is set when the scope
  is local.

Documents and evidence added three more in P4:

- `document_status_ck` and `evidence_state_ck` — the same lesson applied
  immediately, rather than discovered again.
- `evidence_settled_ck` — a settled state has somebody behind it:
  `confirmed` and `dismissed` both require a confirmer and a time, `suggested`
  forbids them, and `stale` keeps whatever it had. Confirming and dismissing are
  equally attributable acts; staleness is something that *happens to* a row, not
  something anybody did.

Two shapes in `evidence` are worth explaining, because both look redundant:

- **`quote`** holds the passage's text at the moment the claim was made. It is
  what lets evidence outlive the document behind it: destroying a document nulls
  `passage_id` and leaves the claim — what the community said it had, and who
  said so — readable and re-confirmable against a future upload.
- **`ai_call` and `ai_usage` live in `db/schema/ai.ts`, alone.** Not tidiness:
  everything under `src/lib/server/ai/` may import that one schema module and no
  other, which is how "no model output writes state" becomes a build failure
  rather than a habit. The boundary could not be *stated* while those tables sat
  beside the content ones.

P5 added three more, and the reason is the same each time:

- `path_weights_range_ck` — no weight below zero. A negative weight would
  *invert* an input rather than silence it, which is neither what the screen
  offers nor something the stated reasons could explain.
- `path_override_position_ck` — a position is not negative.
- `risk_profile_meets_ck` — the meeting question is one of three answers or
  unanswered. Null is "not answered", which is a different thing from "no".

### The ordering's arithmetic, and why the defaults are lopsided

`path_weights` ships `dependency: 250, severity: 10, risk: 10, attention: 8`,
and the gap is load-bearing rather than aesthetic. "A community that changes
nothing sees no change" means the weighted sum has to reproduce the structural
order P3 had — by how many questions are in the way, then by layer. Encoding
that lexicographic key in one contribution scaled to `[0, 1]` makes one layer
worth `dependency ÷ positions`, where `positions` is
`(maxBlockers + 1) × layers − 1`. RCOS-Core 0.1 has seven layers and at most two
blockers, so twenty positions, and the dependency weight has to exceed twenty
times severity — which is the only other input a day-one community scores.

`defaultsPreserveStructure()` computes that from the loaded standard and a test
asserts it, because the two things that would break it — a standard with more
layers, and somebody tidying the defaults — would both do it silently.

P6 added visibility, and it is enforced by **triggers rather than a `CHECK`** —
the one place in the schema that is true, and worth knowing why. Adding a CHECK
to an existing table makes drizzle-kit emit SQLite's twelve-step table rebuild,
wrapped in `PRAGMA foreign_keys=OFF`. That pragma is a **no-op inside a
transaction**, and the migrator runs every migration in one, so the `DROP TABLE`
cascades. On this schema it silently deleted every local definition attached to a
community artifact, and passed on an empty database because there was nothing to
lose. `ALTER TABLE … ADD COLUMN` needs no rebuild, so the column is added plainly
and a `BEFORE INSERT`/`BEFORE UPDATE` trigger raises `ABORT` on a fourth value.
`tests/integration/migration-upgrade.test.ts` guards the whole class by seeding a
database at the previous migration and asserting nothing vanishes.

**Drizzle's `text({ enum })` is not one of these.** It narrows the TypeScript
type and emits a plain `text` column: no `CHECK`, nothing at the database. A
decision written with a type outside `DECISION_TYPES` was accepted and stored,
and the type appeared in the register. So `freeze()` validates the decision type
in the service, and the test that used to rely on a bad enum value to force a
rollback now uses a foreign-key violation instead — the constraint that is
genuinely there.

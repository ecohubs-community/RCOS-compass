---
status: draft for discussion
version: 0.1
date: 2026-08-31
relates_to: 03-data-model.md; RCOS Core Specification — v0.1.md §9.1, §10.1.5, §11.2
---

# Standards, Versions & Modules

RCOS is not one document. It is a **core** with its own version line, plus
**modules** with their own version lines, and a community sits at one specific
point in each. Everything a community writes is an answer to *a clause, in a
standard, at a version* — and that triple has to survive for years, because a
decision record from 2026 must still be readable after the standard moves on.

Modules are post-MVP as a *feature*. The model below is **not** post-MVP: get the
identifiers wrong now and every stored clause reference has to be migrated later.

---

## 1. The identifier problem, stated

Core numbers its clauses from the document (`3.3.2`). Modules will number theirs
**starting at 1.1.1 as well**. So `1.1.1` on its own means nothing — it could be
core Layer 0, permaculture, or minimal-permaculture. And `1.2.3` in core v0.1 may
point at different text than `1.2.3` in core v0.2.

**A clause reference is only meaningful as a triple:**

```
(standard_id, version, ref)      →  core@0.1 · 3.3.2
                                    permaculture@0.1 · 1.1.1
```

**Display rule:** a bare number is never shown once a community has adopted
anything beyond core. The rendered form is scope-first and version-aware:

| Context | Rendered as |
|---|---|
| Inside the community's current core version | `3.3.2` with a `Core 0.1` chip on the surrounding block |
| A module clause | `Permaculture 0.1 · 1.1.1` |
| A decision record, an export, a permalink, anything quotable | always the full `core@0.1 · 3.3.2` |
| A historical decision after a migration | the ref **as quoted at the time**, plus the current ref if it moved |

One component, `<ClauseRef>`, renders all of these. Nothing else formats a clause
reference.

---

## 2. Model

```
standard            id 'rcos-core' | 'rcos-module-permaculture' | 'rcos-module-minimal-permaculture'
                    kind core|module | title | source_url
                    extends_layers[]        -- modules only (RCOS §9.1.2)
                    conflicts_with[]        -- e.g. permaculture ⟷ minimal-permaculture
standard_version    standard_id | version '0.1' | status draft|active|superseded
                    published_at | supersedes? | source_url | licence
clause              standard_id | version | ref | key | layer? | normativity | text | …
                    UNIQUE(standard_id, version, ref)
                    UNIQUE(standard_id, version, key)
section             standard_id | version | artifact_key | clause_keys[] | …
artifact            standard_id | version | key | mandatory | …

community_standard  community_id | standard_id | version
                    status active|migrating|retired
                    adopted_at | adoption_decision_id | retired_at?
                    UNIQUE(community_id, standard_id)
```

Rules:

- Exactly **one** `community_standard` row with `kind = core` and status `active`
  per community. That is "the version we are at".
- Zero or more module rows (post-MVP). Adopting a module is a governance act with
  a decision record — RCOS §9.1.5 requires it to follow the Layer 6 change
  mechanism, so the app must not let it be a settings toggle.
- Adopting a module whose `conflicts_with` names an already-adopted module is
  refused with an explanation, not silently allowed. Permaculture and
  minimal-permaculture are variants of the same domain; a community picks one.
- `definition.community_standard_id` — a definition answers a section *of a
  specific standard at a specific version*. This is the column that makes
  everything below possible.

---

## 3. Compliance and readiness across scopes

RCOS §10.1.5 is explicit: **Optional Modules MUST NOT be included in RCOS-Core
compliance evaluation.** So the arithmetic in `03-data-model.md` §7 runs
**once per adopted standard**, and the results are never added together.

- **Core** produces the binary compliance claim and the headline readiness figure.
- **Each module** produces its own readiness figure and its own completeness
  state, labelled with the module name, never merged into the core number.
- The public index shows the core claim first, in the §10.1.1 binary form, and
  adopted modules in a clearly separate block. A module at 100% must never make a
  non-compliant community look compliant — that is the one way this feature could
  damage the standard, so it is a test, not a guideline
  (`06-testing-strategy.md` §6.5).
- The Path ranks core clauses above module clauses by default, because core
  compliance is the gate. The weight is visible and editable like the others.
- Module sections may **reference** core clauses; they may never **own** them.
  The one-owner rule from `03-data-model.md` §4 holds within each
  `(standard, version)` scope.

---

## 4. Version migration (core 0.1 → 0.2, and every later step)

RCOS §11.2 requires the standard itself to be versioned, backward-compatible
where possible, with breaking changes marked. The community-side counterpart is a
**guided migration**, and it is a governed act — under RCOS §8.1.4 a change to
which standard version is in force is constitutional in shape.

### 4.1 The migration map ships with the standard

A new version is not importable without one. `standard/migrations/core-0.1-to-0.2.yaml`:

```yaml
from: { standard: rcos-core, version: "0.1" }
to:   { standard: rcos-core, version: "0.2" }
summary: "…"
clauses:
  - key: membership.probation.duration
    change: unchanged            # ref may still have moved
    from_ref: "3.3.2"
    to_ref:   "3.3.2"
  - key: economy.spending.thresholds
    change: reworded             # same obligation, clearer text
    from_ref: "5.3.3"
    to_ref:   "5.3.4"
  - key: conflict.safety.immediate
    change: tightened            # the obligation is stricter — needs re-affirmation
    from_ref: "6.3.4"
    to_ref:   "6.3.5"
    note: "now requires a named responder"
  - key: exit.settlement
    change: split
    into: [exit.settlement.assets, exit.settlement.roles]
  - key: ops.meeting.load
    change: removed
  - key: evolution.sunset.review
    change: added
```

Change classes and what each does to a community's work:

| Class | Effect on an adopted definition |
|---|---|
| `unchanged`, `renumbered` | carried forward automatically; ref updated; change-log entry |
| `reworded` | carried forward automatically; flagged **read the new wording** in the review queue, non-blocking |
| `tightened`, `split`, `merged` | definition becomes **needs review against the new text**; blocks compliance under the new version until re-affirmed |
| `removed` | definition kept as historical, marked *no longer required by 0.2*; never deleted |
| `added` | appears as a new gap on the Path |

CI check once a second version exists: **every clause key in the new version must
appear in the migration map**, and every key in the old version must be accounted
for. An unmapped clause fails the build.

### 4.2 The community's flow

1. **Notice.** A new version is available. Nothing changes; the community stays on
   its pinned version indefinitely. No forced upgrades, ever.
2. **Preview.** A read-only screen: what changed, how many of *our* definitions
   are affected, grouped by the classes above, with the old and new clause text
   side by side. Exportable, so it can be taken to a meeting.
3. **Start migration.** `community_standard.status = migrating`. The old version
   stays authoritative throughout. Readiness shows both figures
   (*under 0.1: 62% · under 0.2: 54%*) so the cost is visible before commitment.
4. **Work the review queue.** Each `tightened`/`split`/`merged` definition is
   re-read and either re-affirmed or amended, through the community's normal
   decision path. Splits offer to duplicate the existing text into both new
   sections as a starting draft — a draft, never an adoption.
5. **Adopt.** One decision record adopts version 0.2. It references every
   re-affirmation decision made during the migration. Old version → `retired`.
6. **Abandon.** Available at any point before step 5; drafts are kept, nothing
   adopted is touched.

### 4.3 What must not break

- **Historical decision records keep the ref they quoted.** `decision_clause`
  stores `(standard_id, version, ref, key)` as at decision time. A 2026 decision
  quoting `5.3.3` still reads `core@0.1 · 5.3.3`, with an optional "now
  `core@0.2 · 5.3.4`" annotation. Rewriting history to match a new numbering is
  the one thing that would make the register untrustworthy.
- **Permalinks survive.** `/c/{slug}/d/DEC-2026-014` never moves.
- **Exports state their version** on every page.
- **A community can be mid-migration for months.** It is a governance process,
  not a deploy.

---

## 5. Where the content comes from: the standard repo generates it

**Settled 2026-09-01.** `rcos.ecohubs.community` is not a CMS — it is a SvelteKit
site, `github.com/ecohubs-community/RCOS-website` (formerly
`regenerative-community-blueprint`; the local working copy still carries the old
directory name), that builds its templates from markdown in `content/articles/`,
already in five locales, already producing md/docx/odt bundles and JSON manifests
under `static/downloads/`.

That makes the answer obvious: **the standard repo gains one more build target
— YAML — and Compass consumes it.**

```
RCOS-website/
  content/articles/rcos-templates/layer-*/**.md      ← authored source (5 locales)
  scripts/build-standard-data.mjs                    ← NEW
  static/downloads/standard/
    rcos-core/0.1/{clauses,sections,artifacts,glossary}.yaml
    rcos-core/0.1/rcos-core-0.1.zip
    manifest-standard.json                           ← versions + sha256 per file
```

### 5.1 What the generator can already extract

The templates carry more structure than the spec assumed. From a single template
file the script gets, for free and in all five locales:

| From | Becomes |
|---|---|
| frontmatter `id`, `title`, `parentId`, `order` | stable section ids and ordering |
| `## Heading` | a **section** — the definition atom |
| `*RCOS clauses: [3.4.1](…), [3.4.3](…)*` | the clause→section mapping |
| `<details data-kind="rationale">` | *why it matters* |
| `<details data-kind="instructions">` | *what to define here* |
| `_<placeholder text>_` | draft scaffolding and examples |
| `- **Layer:** 1 — Membership System` | layer assignment |

Measured against the current templates: **22 template files, 118 sections, 190
distinct clauses referenced.** That is most of what P1 was budgeted for, and it
is a script rather than authoring.

### 5.2 What the generator cannot produce, and what it exposes

Three gaps, now sized rather than guessed:

1. **57 clauses are claimed by more than one section.** Some are trivially
   local — `scope-declaration`'s three *In-Scope* sections all cite 2.2.1 — and
   some are genuine cross-artifact judgement calls: 3.1.2 is claimed by
   *Membership Agreement*, *Onboarding Protocol* **and** *Membership State
   Registry*. The one-owner rule (`03-data-model.md` §4) needs an arbitration
   pass over these 57, producing `owner` for one section and `references` for the
   rest. **This is real work and it must happen before the schema is populated.**
2. **12 MUST clauses have no template section at all** — 2.5.3, 3.8.3, 4.7.2,
   4.7.3, 5.5.2, 5.7.3, 6.5.2, 6.7.3, 7.6.2, 7.8.3, 8.6.2, 8.8.3. They are not
   oversights; they are a different *kind* of clause. See §5.3.
3. **25 sections carry no clause line** — either structural headings or genuine
   gaps in the templates. Each needs a disposition, and the generator should list
   them rather than drop them silently.

### 5.3 Three clause dispositions — and a correction to the readiness maths

Looking at the 12 unmapped MUST clauses shows they are all of two shapes:
*"Layer N artifacts MUST be explicit, versioned, accessible to all members"*
(4.7.2, 5.5.2, 7.6.2, 8.6.2 …) and *"The following MUST remain optional and out
of scope"* (5.7.3, 6.7.3, 7.8.3, 8.8.3), plus the compliance rules
(2.5.3, 3.8.3). **No community text answers those.** So every clause carries one
of three dispositions:

| Disposition | Meaning | Counts toward readiness? |
|---|---|---|
| `defined_by_section` | a community writes an answer — the normal case | **yes** |
| `satisfied_by_platform` | the app's own behaviour satisfies it: versioning, member accessibility, ratification records, append-only history | no — shown as *"satisfied by Compass"* with a link to how |
| `not_a_definition` | a rule about the standard or about compliance itself | no — shown in the standard browser, excluded from counts |

**This is a correction to `03-data-model.md` §7**: readiness counted MUST clauses
over *all* MUST clauses, which made 100% unreachable by construction. The
denominator is `defined_by_section` MUST clauses only. Dispositions live in the
generated YAML, are reviewed by a human once, and are covered by the CI ownership
check.

### 5.4 How Compass consumes it

**Vendored, pinned, and hash-checked — not fetched at runtime.**

- Compass keeps its own copy at `standard/rcos-core/0.1/`, with the upstream
  `sha256` recorded in `meta.yaml`.
- A published version is immutable. A CI job compares the vendored hash against
  the published manifest weekly and **opens a PR** when it differs — never
  auto-updates, because a change to a published version is either a bug fix that
  needs review or a new version that needs a migration map (§4).
- No build-time or runtime network dependency, so self-hosted instances and
  offline CI work unchanged, and the exact bytes a community's decisions point at
  stay reproducible.

### 5.5 And publish the YAML for everyone

Worth doing for its own sake: put the generated YAML and JSON next to the
existing md/docx/odt downloads on rcos.ecohubs.community, with the CC BY 4.0
licence line embedded in each file. It costs nothing extra once the generator
exists, and it is the concrete form of "a standard other people can build on" —
the argument UI spec §8 already makes. Compass then becomes the first consumer of
a public artifact rather than the only holder of a private one.

## 6. What MVP builds now, and what it only prepares

**Builds now** (core v0.1 is the only version, and no modules exist yet):

- The `(standard_id, version, ref/key)` triple everywhere — DB, URLs, exports,
  decision records.
- `community_standard` with the core row, set at community creation.
- `<ClauseRef>` as the single formatter, already scope-aware.
- Readiness/compliance computed **per standard**, even though only one exists —
  a one-row loop today, no rewrite later.
- The migration-map schema and the `standard/migrations/` directory, empty but
  validated, so authoring 0.2 has a target.
- Content pipeline that can load more than one standard (`standard/<standard>/<version>/`).

**Post-MVP** (in roadmap order): the module catalogue and adoption flow; module
content for permaculture and minimal-permaculture once their templates exist; the
migration preview and review queue UI; the standard-diff view.

The whole point of the split: when core 0.2 lands or the first module gets its
templates, the work is **content plus screens** — not a schema migration across
every community's history.

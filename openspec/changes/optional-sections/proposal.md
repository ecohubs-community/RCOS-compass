## Why

RCOS-Core never requires a community to list non-goals. The Purpose Charter's
*Non-Goals and Exclusions* section follows the non-normative example in the
standard's Appendix B, and its clause line (2.1.5) is a reference, not an
obligation — 2.1.5 is owned by *Primary Purpose*. RCOS-website now says so in
the template ("recommended, not required") and publishes the section with a new
`optional: true` flag (RCOS-website, 2026-11-06 generation).

Compass counts every authored section toward artifact completeness, and the
outward claim requires every authored section of every mandatory artifact. So
today a community cannot claim compliance without writing non-goals — Compass
asks for more than the standard does, which is the one thing it must never do
(`AGENTS.md`: "It never decides for them").

Reasoning: `docs/03-data-model.md` §3b (updated here); RCOS-website
`content/standard/rcos-core/0.1/ownership.yaml`, section "Optional".

## What Changes

- **Re-vendor RCOS-Core 0.1** from RCOS-website's `static/downloads/standard/`,
  every file in its manifest byte for byte. Structure is unchanged: no clause,
  section or artifact key, owner, disposition or clause text moved. New:
  every section carries `optional` (true only for
  `purpose-charter.non-goals-and-exclusions`); 32 sections cite clauses they
  implement but did not list (2.1.3 on *Primary Purpose*; the "MUST define, at
  minimum" umbrellas 4.5.2, 5.5.3, 5.5.4, 6.2.3, 6.5.3, 6.5.4, 7.6.3, 8.6.3 on
  the sections answering their items; 3.2.2, 3.4.3, 6.4.3, 7.1.3, 8.3.4 where a
  sibling section applies them too) — references only, ownership unchanged;
  12 artifacts gain their template description as `summary`.
- **`StandardView.requiredSections()` / `requiredSectionsOf(key)`** — authored
  and not optional. `authoredSections*` keep meaning "a community may write it".
- **What reads the required set:** artifact completeness (`progressOf`), the
  outward claim, the self-audit, the Path, and the Ratification Record (the
  decision behind the last *required* section adopted).
- **What keeps reading the authored set:** writing, discussing, freezing,
  rendering, publishing, provenance, the public index. An optional section is
  written like any other.
- **Artifact page:** an optional section shows its status, question and "Start"
  link with the label "Optional — not counted"; it is no progress segment and
  never a blocker. **Standard page:** the same label; counts are of required
  sections, and "only what is still unanswered" leaves optional sections out.
- **`check:standard`:** `optional` must be a boolean; only an authored section
  may be optional; an optional section may own no MUST clause; a mandatory
  artifact needs at least one required section.

## Impact

- Purpose Charter: 4 → 3 counted sections. The Path: 94 → 93 items. Readiness
  (countable clauses) does not move: Non-Goals owns no clause.
- A community that already adopted Non-Goals keeps it; it simply stops counting.
- Messages: `section_optional` in en, de, es.

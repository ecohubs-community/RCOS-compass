## Context

After RCOS-website#13, every "Layer N artifacts MUST be" clause (2.5.2, 3.8.2,
4.7.2, 5.5.2, 6.5.2, 7.6.2, 8.6.2) and every "missing artifacts cost compliance"
clause (2.5.3, 3.8.3, 4.7.3) is `satisfied_by_platform`. Compliance already
implements the x.y.3 half: `incompleteMandatoryArtifacts` and the provisional
rule. What no screen shows is the x.y.2 half.

## Decisions

### 1. Properties per clause, written down once

The clauses list different properties per layer (Layer 2 does not name adoption;
Layer 5 names "living documents"; Layers 3–6 allow bounded exceptions to
accessibility, 0–2 do not). Parsing the clause text would break on the first
translation or rewording, so a map keyed by the clause's **stable key**
(`l0.artifacts.2` …) names each layer's properties:

| Clause | Properties |
|---|---|
| l0.artifacts.2 | accessible (no exceptions), versioned, ratified |
| l1.artifacts.2 | explicit, versioned, accessible (no exceptions) |
| l2.artifacts.2 | explicit, versioned, accessible (no exceptions) |
| l3.artifacts.2 | explicit, versioned, accessible (bounded exceptions), ratified |
| l4.artifacts.2 | explicit, versioned, accessible (bounded exceptions), ratified |
| l5.artifacts.2 | explicit, versioned, accessible (bounded exceptions), maintained |
| l6.artifacts.2 | explicit, versioned, accessible (bounded exceptions), ratified |

Every layer also gets **complete** (x.y.1 and x.y.3). A layer whose x.y.2 clause
is missing from the map shows only that check — a module or a later version
degrades to "complete", never to a guess.

- *Alternative: a checkbox per property* (raised in review) — rejected for the
  structural properties, because Compass already knows; a ticked box next to a
  computable fact is a second source of truth that can disagree with the first.

### 2. What each check reads

Over the community's **adopted, standard-scope** definitions whose section's
artifact is in the layer:

| Property | Met | Not met | Needs attention | Other |
|---|---|---|---|---|
| complete | every mandatory artifact complete (`progressOf`) | lists incomplete artifacts with answered/authored | — | — |
| versioned | every adopted definition has its adopted version | an adopted pointer with no version row | — | structural; kept so the page answers every word of the clause |
| accessible | none restricted, or (bounded layers) each restricted one under a live exception | restricted in a no-exception layer, or restricted without a live exception | — | bounded exceptions listed with their end date |
| ratified | every adopted version has a `decisionId` | a version with none | provisional definitions | — |
| explicit | — | — | — | always "a human decides"; counts adopted versions whose stored linter result is not clean or absent |
| maintained | every adopted definition has a review date in the future | one with no review date | one past its review date | — |

With nothing adopted in a layer, every check but **complete** reads "nothing
adopted yet".

### 3. One service, one read

`layerChecks(ctx, { db })` in `src/lib/server/services/layer-checks.ts`:
`requirePermission(ctx, 'community.read')`, filters on `ctx.community.id`,
returns one entry per layer of the active standard (empty when none). Four
queries in total — definitions with their adopted versions, live exceptions,
answered sections — not one per definition.

### 4. Shown above each layer's artifacts

The standard page groups artifacts by layer already; the checks render once, at
the first artifact of each layer, as a list (not a table — a list reads on a
phone without becoming cards). Each row: the property in words, a result word
with an icon, the clause references through `<ClauseRef>`, and a `<details>`
listing what fails, each linking to its definition. A `<HelpTip id="layer-checks">`
explains that these are the standard's rules about artifacts and that compliance
only follows "complete" and "provisional". The "only unanswered" filter does not
hide the checks.

## Risks / Trade-offs

- [Restricted Layer 0–2 definitions do not cost compliance though x.y.3 says
  they should] → shown as "not met", and listed as an open question in the
  proposal; changing compliance is its own decision.
- ["A human decides" looks like a non-answer] → it says how many definitions
  have open findings, and links them, so the human has something to read.

## Why

RCOS says Layer 0, 1 and 2 artifacts MUST be accessible to all members (§2.5.2,
§3.8.2, §4.7.2) and gives no exception — unlike Layers 3–6, which allow
"explicit, bounded" ones. And it says missing, ambiguous or violated Layer 0–2
artifacts cost compliance (§2.5.3, §3.8.3, §4.7.3). An adopted definition that
members cannot read is, for a member, a rule that is not there.

`layer-artifact-checks` shows a restricted Layer 0–2 definition as "not met" and
deliberately left compliance alone. Decided 2026-10-01: it blocks compliance.

## What Changes

- **A restricted, adopted, standard-scope definition in a layer whose artifact
  rule allows no exception makes the community not compliant**, everywhere
  compliance is computed: `compliance()`, the outward claim on the public page
  and in exports, and the self-audit.
- **One rule, three readers.** The three already repeat the completeness and
  provisional conditions; the new condition is one function in
  `layer-checks.ts` they all call, so they cannot disagree about it.
- **The public page names the count, not the rules** — like provisional
  definitions: "2 rules that every member must be able to read are restricted".
  A restricted rule's title is not published.
- The layer-checks note and the help say compliance now follows three checks.
- Layers 3–6 are unchanged: a restricted definition there is a bounded
  exception while a live transparency exception covers it, and the expiry job
  reverts it when that ends.

Version: ships with the layer checks in one PR, `0.10.1 → 0.11.0` — one bump
per PR, at the highest level its changes reach.

## Capabilities

### Modified Capabilities
- `readiness`: compliance is also false while a Layer 0–2 definition is restricted.
- `layer-checks`: the checks inform except that one, which now decides.

## Impact

`layer-checks.ts`, `readiness.ts`, `claim.ts`, `self-audit.ts`; the public page,
the audit page and the layer-checks component copy. A stored self-audit snapshot
from before this has no `restricted` field and reads as none. No migration.

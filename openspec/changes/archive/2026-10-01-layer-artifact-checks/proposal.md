## Why

Each RCOS layer ends with three artifact clauses: which artifacts are mandatory
(x.y.1), what every one of them must be (x.y.2 — explicit, versioned, accessible
to all members, adopted through a governance process, maintained), and that
missing or ambiguous ones cost compliance (x.y.3). Since RCOS-website#13 all of
x.y.2 and x.y.3 are `satisfied_by_platform`: no community writes an answer to
them. That is right for counting and leaves a gap for reading — nothing on any
screen shows whether a community's artifacts *are* what these clauses say, and
three of the properties are not structural guarantees:

- **Accessible to all members** fails the moment an adopted definition is
  restricted. Layers 0–2 allow no exception; Layers 3–6 allow only "explicit,
  bounded" ones — which is what a transparency exception with an end date is.
- **Adopted through a governance process** is not met by a provisional
  definition, adopted before the Decision Matrix existed.
- **Explicit and unambiguous** cannot be certified by any tool. The linter
  assists; a human decides.

The review on 2026-09-30 asked for exactly this: the clauses stay off the Path,
and the standard page shows whether each layer's artifacts meet them.

Reasoning: RCOS-Core §2.5, §3.8, §4.7, §5.5, §6.5, §7.6, §8.6;
`docs/03-data-model.md` §9 (visibility, transparency exceptions);
`docs/12-clause-ownership-report.md`; RCOS-website#13.

## What Changes

- **A "Checks" block per layer on the standard page**, above that layer's
  artifacts. One row per property the layer's x.y.2 clause names, plus
  "every mandatory artifact is complete" (x.y.1, x.y.3). Each row says met,
  not met, needs attention, nothing adopted yet, or "a human decides", in
  words as well as colour, cites its clause, and lists what fails.
- **Computed live** from what Compass already stores: artifact completeness,
  definition visibility and live transparency exceptions, the decision behind
  each adopted version, the provisional flag, each adopted version's linter
  result, and review dates. Nothing new is stored and nobody ticks a box.
- **Standard-scope adopted definitions only.** Local definitions answer no RCOS
  clause and are left out, as everywhere else.
- **Compliance is unchanged.** It already fails on a missing artifact and on a
  provisional definition; the other checks inform, and the page says so.

Version: `0.10.1 → 0.11.0` — members and stewards can see whether each layer's
artifacts meet the standard's artifact rules.

## Capabilities

### New Capabilities
- `layer-checks`: the per-layer artifact checks, what each is computed from,
  and how the standard page shows them.

### Modified Capabilities
None.

## Impact

- New `src/lib/server/services/layer-checks.ts`; the standard page's load and
  markup; copy in `messages/*.json`; a help entry.
- No schema change, no migration.
- **Open question for later:** whether a restricted adopted definition in
  Layers 0–2 should block compliance (the x.y.3 clauses would say yes). Not
  decided here; the check shows it.

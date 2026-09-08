## Why

Seven phases in, a community works against exactly one standard at exactly one
version, forever. Nothing can extend RCOS-Core for a community that also farms,
and nothing can move a community from core 0.1 to 0.2 — which means the day the
standard's authors publish either, every community using Compass is stuck on
what they adopted, and the only route forward is somebody editing rows by hand.

`docs/09-standards-versions-modules.md` §6 is explicit that the MVP would
*prepare* for this rather than build it, and it kept that promise: the
`(standard_id, version, ref, key)` triple is on every decision record, readiness
already loops over adopted standards rather than assuming one, and the loader
takes a root so two versions can be held in memory side by side. What is missing
is everything above that line.

**The trigger has not fired, and this proposal is deliberately going ahead
anyway.** `standard/upstream-manifest.json` lists one standard: `rcos-core@0.1`.
No module templates are published and no 0.2 is in draft. The roadmap's condition
for starting P8 is that one of those exists — so the honest reading is that this
phase builds the *machinery* against fixtures and leaves the content for the day
it arrives. That is not a workaround. It is the only way to discover that a
migration-map schema is wrong before a real migration map is written against it,
and the alternative is finding out with a live pilot mid-upgrade.

## What Changes

- **A standard can be a module, and a community can adopt one.** `kind`,
  `extends_layers` and `conflicts_with` become part of what a standard declares.
  Adopting is a governance act with a decision record — RCOS §9.1.5 requires the
  Layer 6 change mechanism, so the product must not let it be a settings toggle
  — and adopting a module that conflicts with one already adopted is refused
  with an explanation naming the conflict.
- **Module readiness is reported beside the core claim and never added to it.**
  RCOS §10.1.5: optional modules MUST NOT enter core compliance evaluation. A
  module at 100% must never make a non-compliant community look compliant, on any
  surface, and the public index shows the core claim first with modules in a
  separate block. This is the one way the feature could damage the standard, so
  it is asserted rather than intended.
- **A migration map ships with a standard version, and is validated.**
  `standard/migrations/<from>-to-<to>.yaml` with the six change classes from
  `docs/09` §4.1. Every clause key in both versions must be accounted for; an
  unmapped key fails the build, which is the check that makes the map worth
  trusting.
- **A community can see what a new version would cost, before deciding.** The
  preview: what changed, how many of *this community's* definitions are affected,
  grouped by class, old and new text side by side, exportable so it can be taken
  to a meeting. With the community's own definitions filtered out it is also the
  standard-diff view the roadmap lists separately — one screen, because the data
  is the same and two would disagree.
- **A community can migrate, over weeks, without anything being forced.** Start
  → the old version stays authoritative and both readiness figures are visible →
  work the review queue, where `tightened`, `split` and `merged` definitions are
  re-affirmed or amended through the community's normal decision path → one
  decision adopts the new version, referencing every re-affirmation → the old
  version is retired. Abandon is available at every point before that decision,
  and keeps the drafts.
- **History keeps the reference it quoted.** A 2026 decision quoting
  `core@0.1 · 5.3.3` still reads that way after the migration, annotated with
  where the clause went. Rewriting a register to match a new numbering is the one
  change that would make it untrustworthy, and it is easier to do by accident
  than to undo.
- **Fixtures, not content.** A fixture module and a fixture `rcos-core@0.2` under
  `tests/fixtures/standard/`, authored to exercise all six change classes
  including a split and a merge. Real content drops in with no code change —
  that is the claim `docs/09` §6 makes, and this phase is where it gets tested.

## Capabilities

### New Capabilities

- `modules`: what a module is, how adopting one is a governance act, how a
  conflict is refused, and the rule that a module's readiness is never added to
  the core claim on any surface.
- `standard-migration`: the migration map and its validation, the preview a
  community decides from, the review queue and what each change class does to an
  adopted definition, the decision that adopts a version, the abandon path, and
  what must not move while all of it happens.

### Modified Capabilities

- `standard-content`: a standard declares its kind and its relationships, more
  than one may be loaded at once, and a version's migration map is part of what
  ships with it.
- `readiness`: the figures are per adopted standard rather than per community,
  the core claim is computed from core alone, and a migrating community has two
  figures at once.
- `decisions`: adopting a standard or a module is a decision, and a decision's
  clause references keep the version they were made against.
- `tenancy`: a community holds one active core standard and any number of
  modules, with the decision that adopted each.
- `path-ordering`: module clauses appear in the ordering below core ones by
  default, with the weight visible and editable like every other.
- `publishing`: the public index shows the core claim first and adopted modules
  in a separate block, and no module figure may appear inside the claim.

## Impact

**Schema.** `community_standard` gains `adoption_decision_id` (the model in
`docs/09` §2 names it and the table never had it) and loses its unique index on
`(community_id, standard_id)` in favour of one that admits a retired row beside
an active one — a community that migrated has both. New `standard_migration`
rows recording an in-flight migration and its review queue. Additive except the
index, which is replaced.

**The standard loader.** It already takes a root and caches per root; what it
does not have is a way to enumerate what is available, which a catalogue needs.

**Every surface that says "the standard".** The dashboard, the path, the
readiness panels, the artifact pages, the exports, the public index. Most already
carry `(standard_id, version)`; the ones that assume core are the phase's real
footprint, and the registry test that P6 and P7 both used is how they are found
rather than remembered.

**No new dependency.** YAML, the loader and the decision path all exist.

**What this phase cannot do.** Module content for permaculture and
minimal-permaculture, because no templates exist to parse. The moment they do,
that work is a content pass with no code in it — and if that turns out to be
false, this phase failed and it is better to learn it against a fixture.

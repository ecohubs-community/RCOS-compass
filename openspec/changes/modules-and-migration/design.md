## Context

`docs/09-standards-versions-modules.md` was written in P0 and split the work in
two: what the MVP builds (the identifiers, the per-standard arithmetic, a loader
that can hold two versions at once) and what it only prepares for. Seven phases
later the prepared half held up — `decision_clause` already stores
`(standard_id, version, ref, key)`, `readiness()` already takes a `standardId`,
and the loader already keys its cache by root because a migration preview would
need the same id and version from two places. This phase is the other half.

Four constraints shape it.

**Neither trigger has fired.** There is one standard in
`standard/upstream-manifest.json` and it is `rcos-core@0.1`. So every mechanism
here is built and proved against fixtures, and the phase's real claim is the one
`docs/09` §6 makes: when content lands, the work is content and screens rather
than a schema migration across every community's history. A fixture is how that
claim gets tested before it is relied on.

**A migration is a governance process, not a deploy.** §4.2 says a community can
be mid-migration for months. Everything below has to be correct while paused: the
old version stays authoritative, both figures are visible, and abandoning is
free.

**The register must not move.** §4.3 is unambiguous — a 2026 decision quoting
`core@0.1 · 5.3.3` still reads that way afterwards. Renumbering history to match
a new version is the single change that would make the record untrustworthy, and
it is the kind of thing a well-meaning "update the refs" migration does in one
line.

**A module must never flatter a community.** RCOS §10.1.5 keeps optional modules
out of core compliance evaluation. The failure this prevents is a community at
100% on a farming module reading as compliant with core while missing eleven
mandatory artifacts — which would be Compass damaging the standard it exists to
serve.

## Goals / Non-Goals

**Goals:**

- A community can adopt a module as a recorded decision, and cannot adopt two
  that conflict.
- A module's figures appear beside the core claim and never inside it, on every
  surface including the public one.
- A version's migration map is validated against both versions, so an unmapped
  clause is a failed build rather than a surprise mid-migration.
- A community can see what a new version costs before committing, take that to a
  meeting, migrate over weeks, and abandon at any point before the adopting
  decision.
- Every decision keeps the clause reference it was made against.
- The fixtures exercise all six change classes, so the day real content arrives
  the only new work is content.

**Non-Goals:**

- **Module content.** No templates exist for permaculture or
  minimal-permaculture. Writing plausible-looking clauses for them would produce
  a fixture pretending to be a standard, which is worse than an obvious fixture.
- **Authoring the real core 0.2 migration map.** It ships with the standard, from
  upstream. This phase defines the schema, validates it, and writes a fixture.
- **Migrating between two modules, or a module changing version.** The same
  machinery should serve it; nothing here asserts that it does, and claiming
  otherwise would be untested.
- **Automatic upgrades.** No community is ever moved by a deploy. §4.2 step 1.

## Decisions

### 1. A module is a standard with three more fields, not a second kind of thing

`meta.yaml` gains `kind: core | module`, `extends_layers: [n]` and
`conflicts_with: [standard-id]`. Absent means `core` and empty, so
`rcos-core@0.1` loads unchanged and the vendored-hash check keeps the file
honest.

The alternative — a `module` table beside `standard` — was rejected because
everything a module needs already exists for a standard: clauses, sections,
artifacts, a glossary, five locales, a readiness computation. A module *is* a
standard that declares which layers it extends. The one asymmetry is the
constraint that exactly one active `kind: core` row exists per community, and
that belongs in the tenancy rule rather than in a second table.

### 2. Adoption is a decision, and the community_standard row records which one

`community_standard` gains `adoption_decision_id`. `docs/09` §2's model has it;
the table shipped without it in P2 because nothing adopted anything after
creation.

The decision comes first and the row second, in one transaction: a module row
whose adoption decision does not exist is a settings toggle wearing a record.
RCOS §9.1.5 asks for the Layer 6 change mechanism, so the flow is the community's
ordinary decision path — a proposal, whatever mechanism their Decision Matrix
names, a freeze — and adopting is what the freeze does, not a button beside it.

### 3. Conflicts are refused at adoption, by name

`conflicts_with` is symmetric and checked in both directions: adopting
`minimal-permaculture` while `permaculture` is active is refused, and so is the
reverse. The refusal names the adopted module and says a community picks one,
because "conflict" alone sends somebody to read a spec.

Considered and rejected: allowing both and reporting them separately. They are
variants of one domain — a community holding both would have two answers to the
same obligation and no rule for which governs.

### 4. The unique index becomes partial, because a migrated community has both rows

`community_standard` is unique on `(community_id, standard_id)` today. After a
migration the community has core 0.1 `retired` and core 0.2 `active`, and after
two migrations, three rows. The index becomes unique on
`(community_id, standard_id) where status <> 'retired'` — the same partial-index
shape P6 used for one live transparency exception per subject.

That is the one non-additive change in the phase, and it is the one that would
silently allow two active core rows if it were simply dropped.

### 5. A migration is its own record, and the old version stays authoritative

```
standard_migration        community_id | standard_id | from_version | to_version
                          status planning|working|adopted|abandoned
                          started_by | started_at | decision_id? | ended_at?
standard_migration_item   migration_id | section_key | change_class
                          state pending|reaffirmed|amended|carried
                          decision_id? | note?
```

The `community_standard` row stays `active` on the old version for the whole
migration. `status = 'migrating'` from `docs/09` §4.2 is *derived* — a community
is migrating when a `standard_migration` row is `working` — rather than stored in
two places that can disagree. The column keeps its enum for the shape the
document describes; nothing writes `migrating` to it.

The items are stored rather than recomputed because the queue is worked over
weeks and a member needs to see what is left. Recomputing from the map on every
read would also lose the one thing worth keeping: that a particular definition
was re-affirmed, by which decision.

### 6. A definition's change class is the strictest class among its section's clauses

The migration map is over **clause** keys; a definition answers a **section**.
The join is the section's clause list, and a section whose clauses changed in
different ways takes the strictest:

`removed < unchanged < renumbered < reworded < tightened < merged < split`

A section with one reworded clause and one tightened clause needs re-reading,
because the tightened obligation is now stricter and the community's text may no
longer meet it. Taking the *loosest* would carry it forward silently, which is
the failure mode worth naming: nobody notices a definition that quietly stopped
satisfying its clause.

### 7. Carry-forward happens at adoption, in one transaction, and never rewrites history

Until the adopting decision, nothing moves. At adoption:

- definitions whose class is `unchanged`, `renumbered` or `reworded`, and those
  re-affirmed or amended in the queue, are re-pointed at the new
  `community_standard` row;
- definitions whose clauses were `removed` stay pointed at the retired row and
  are marked historical — never deleted, per §4.1's table;
- `clause_coverage` is rebuilt for the new version;
- the old row becomes `retired`, the new one `active`;
- one change-log entry, and the decision references every re-affirmation made
  during the migration.

`decision_clause` is not touched. A decision keeps the version, ref and key it
quoted. Where a reader would benefit, the *rendering* resolves "now
`core@0.2 · 5.3.4`" through the map at display time — a fact derived on read, not
a column that has to be kept true.

### 8. The preview is the diff, with the community's own work optional

One screen. It reads the map plus the two loaded versions and shows each changed
clause with its old and new text, grouped by class, with a count of this
community's affected definitions. A filter hides the community's own material,
and that is the standard-diff view the roadmap lists separately.

Two screens would mean two renderings of the same comparison, and P6 already
learned what that costs: one artifact renderer with thin adapters, because three
implementations agree on the day they are written.

Exportable as Markdown, because §4.2 step 2 says a community takes it to a
meeting and a screen is not something you take to a meeting.

### 9. Readiness gains a scope, and the outward claim refuses to gain a field

`readiness()` already takes `standardId`. It gains the ability to answer for a
specific `community_standard` row, which is what a migration needs — the same
community, two versions, two figures at once.

`outwardClaim` keeps having no numeric field at all, which is P6's structural
guard, and gains no module figure inside it. Modules appear on the public index
as their own block with a **binary** state per module and a name, because a
percentage on a public surface is the thing UI spec §1.4 forbids and a module's
percentage is not an exception to it.

The test is the one `docs/06` §6.5 asks for: a community with a module at 100%
and core incomplete must read as not compliant on every surface, and the
assertion is over the rendered page rather than the service, because the service
returning the right shape is not what protects the standard.

### 10. Fixtures live under `tests/fixtures/standard/` and are obviously fixtures

A fixture module (`fixture-module-orchard`) and a fixture `rcos-core@0.2`, loaded
through the same loader by root. They are named so nobody mistakes them for
content, and the 0.2 fixture is *derived from the real 0.1* — the same clauses
with a small set of deliberate changes covering all six classes, including one
split and one merge.

Deriving rather than inventing matters: a hand-written 0.2 would exercise the
code against clauses that behave differently from the real ones, and the property
being tested is that a real migration works.

### 11. The map is validated as a build step, like the standard itself

`scripts/check-migrations.mjs`, run by `pnpm lint` beside `check-standard.mjs`.
Every clause key in the new version must appear in the map, every key in the old
version must be accounted for, `into:` targets must exist, and a `split` must
name at least two. An unmapped key fails the build.

This is what makes the map worth trusting during a migration that runs for
months: the alternative is discovering a missing key when a community is halfway
through, with no way to tell whether the omission was deliberate.

## Risks / Trade-offs

**The fixtures diverge from what upstream actually publishes** → The most likely
failure of the whole phase. Mitigations: the 0.2 fixture is derived from the real
0.1 rather than invented, the map schema comes from `docs/09` §4.1 verbatim, and
the validator enforces the shape rather than the content. If upstream's first map
does not fit, the schema was wrong and this phase found it for the price of a
fixture instead of a live migration.

**Carry-forward is one large transaction** → It re-points definitions, rebuilds
coverage and retires a row. Mitigation: it is a transaction, it is asserted
row-for-row against a before-snapshot the way P7's erasure test is, and a failure
leaves the community on its old version — which is the safe direction.

**A community abandons after re-affirming twenty definitions** → The
re-affirmation decisions are real decisions and stay in the register; only the
migration record ends. That is correct and worth stating on the abandon screen,
because a community that thinks abandoning erases twenty decisions will not
abandon when it should.

**Module clauses crowd the Path** → They rank below core by default with a
visible, editable weight. The risk is a community adopting a module and finding
its next twenty items are module work while core compliance is the gate.

**Two active core rows** → Prevented by the partial index, which is the one
non-additive schema change here and therefore the one to get wrong. The migration
test asserts the constraint directly rather than trusting the index definition.

## Migration Plan

One migration: `community_standard.adoption_decision_id`, the replacement
partial unique index, `standard_migration`, `standard_migration_item`.

Replacing an index is the only step that is not additive. It drops
`community_standard_idx` and creates the partial one; no table is rebuilt, so
drizzle-kit's twelve-step rebuild — the P6 hazard — is not in play, and the
migration test that P6 added covers it either way.

Existing rows are untouched: every community has one active core row, which
satisfies the new index as it satisfied the old.

Rollback: the previous build runs against the new schema, except that a database
which has already retired a row would fail the old index if it were restored.
That is stated here so it is a decision rather than a discovery — once a
community has migrated, the schema does not go back.

## Open Questions

- **Where does `conflicts_with` come from when upstream does not emit it?** The
  fixture declares it. If the real generator never adds these fields, Compass
  needs its own overlay beside `annotations.yaml`, and the loader is where that
  would go. Not built on speculation.
- **Should a module be adoptable while a core migration is in flight?** Refused
  for now — two governance processes over the same standard set at once is a
  state nobody has asked for and every screen would have to explain. Easy to
  relax later; hard to un-ship.
- **What happens to a module when the core version it extends is retired?**
  `extends_layers` is a layer list rather than a version pin, so nothing breaks
  mechanically. Whether the module's own clauses still make sense against core
  0.2 is a question for its authors, and the preview does not attempt to answer
  it.

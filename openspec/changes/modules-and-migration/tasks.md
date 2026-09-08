## 0. The target, and the fixtures everything else is proved against

- [ ] 0.1 Write the exit spec first, `fixme`: a community previews a fixture 0.2 and takes the preview to a meeting; starts a migration and sees both figures; works the review queue; adopts, and every decision from before still quotes the version it was made against; and a second community adopts a fixture module, completes it, and still reads as not compliant with core
- [ ] 0.2 `tests/fixtures/standard/rcos-core/0.2/` — **derived from the real 0.1** rather than invented, with a small set of deliberate changes covering all six classes: unchanged, renumbered, reworded, tightened, split, merged, removed, added. A hand-written 0.2 would exercise the code against clauses that behave differently from the real ones
- [ ] 0.3 `tests/fixtures/standard/fixture-module-orchard/0.1/` — a module extending two layers, referencing core clauses and owning none of them, plus `fixture-module-orchard-lite` that conflicts with it. Named so nobody mistakes either for content
- [ ] 0.4 `standard/migrations/rcos-core-0.1-to-0.2.yaml` for the fixture pair, in the schema `docs/09` §4.1 states verbatim
- [ ] 0.5 Tests: the fixtures load through the same loader as the real standard; the 0.2 fixture's clause keys differ from 0.1 in exactly the ways the map claims — a fixture that has drifted from its own map would make every test below pass for the wrong reason

## 1. A standard can say what it is

- [ ] 1.1 `kind`, `extends_layers` and `conflicts_with` as optional fields in `meta.yaml`, defaulting to core with no conflicts so `rcos-core@0.1` loads unchanged
- [ ] 1.2 The loader can enumerate what is available — id, version, kind — which is what a catalogue and a version list both need, and what it cannot do today
- [ ] 1.3 A module's section may reference a core clause and may not own one; loading a module that owns one fails, naming the clause
- [ ] 1.4 `scripts/check-migrations.mjs` in `pnpm lint`: every key in the new version mapped, every key in the old accounted for, `into:` targets present, a split naming at least two. An unmapped key fails the build
- [ ] 1.5 Tests: the real standard is unaffected by the new fields; a module owning a core clause is refused; the validator fails on a missing key, a bad target and a one-way split — **mutation-checked** by removing a key from the fixture map and watching the build go red

## 2. Schema, and the index that has to change

- [ ] 2.1 Migration: `community_standard.adoption_decision_id`; `standard_migration`; `standard_migration_item`; and the unique index replaced by a partial one on `(community_id, standard_id) where status <> 'retired'`
- [ ] 2.2 The index replacement is the one non-additive step in the phase. It drops and creates rather than rebuilding the table, so drizzle-kit's twelve-step rebuild — P6's hazard — stays out of it
- [ ] 2.3 Tests: a migration-upgrade test over a database seeded at the previous schema, asserting every community still has exactly one active core row, that a retired row may sit beside an active one, and that a **second active** core row is still refused. The last is the property the index exists for and the one a careless replacement would drop

## 3. Adopting a module

- [ ] 3.1 The catalogue: what is available, which layers each extends, what conflicts with what, and what this community already has
- [ ] 3.2 `adoptModule()` — refuses without an adopting decision, refuses a conflict in either direction naming the module already in force, and writes the row and its decision reference in one transaction
- [ ] 3.3 The adoption goes through the community's ordinary decision path rather than a button beside it: RCOS §9.1.5 asks for the Layer 6 mechanism, and a settings toggle wearing a record is exactly what that forbids
- [ ] 3.4 Tests: adopting works and names its decision; a conflict is refused from both sides; adopting without a decision is refused; a member is refused; two unrelated modules coexist

## 4. Figures that are never added together

- [ ] 4.1 Readiness answers for a specific adopted standard, and the dashboard shows one figure per standard, each labelled
- [ ] 4.2 The outward claim stays computed from core alone, and gains no module field — P6's structural guard is that the type has no number on it, and this is where somebody would add one
- [ ] 4.3 The public index shows the core claim first and modules in a separate block, binary per module, no percentage anywhere
- [ ] 4.4 Tests: the one `docs/06` §6.5 asks for — a community with a module complete and mandatory core artifacts missing reads as **not compliant** on the dashboard, in the export and on the public page. Asserted over the rendered pages rather than the service, because the service returning the right shape is not what protects the standard. **Mutation-checked** by making the claim consider every adopted standard and watching the public-surface test fail

## 5. The preview, which is also the diff

- [ ] 5.1 Load both versions side by side through the loader's root, and read the map: each changed clause with its old and new text, grouped by class
- [ ] 5.2 How many of *this* community's definitions each class affects, with a definition's class the **strictest** among its section's clauses — a section with one reworded and one tightened clause needs re-reading, and taking the loosest would carry it forward silently
- [ ] 5.3 A filter that hides the community's own material, which is the standard-diff view the roadmap lists separately. One screen, because two renderings of one comparison is what P6's artifact renderer exists to prevent
- [ ] 5.4 Exportable as Markdown: `docs/09` §4.2 step 2 says a community takes it to a meeting, and a screen is not something you take to a meeting
- [ ] 5.5 Tests: the preview changes nothing — asserted by serialising the community's rows before and after, the way P7's erasure test does; the strictest-class rule over a section with mixed classes; the export opens without the application

## 6. Migrating, over weeks

- [ ] 6.1 `startMigration()` — the record, the queue built from the map, and the adopted version still in force. `status = 'migrating'` on `community_standard` is deliberately not written: a community is migrating when a migration row is working, and two places that can disagree is one too many
- [ ] 6.2 Both readiness figures while one is in flight, each naming its version, so the cost is visible before commitment
- [ ] 6.3 The review queue: every tightened, split or merged definition re-affirmed or amended through the community's normal decision path. A split offers the existing text as a draft in each new section — a draft, never an adoption
- [ ] 6.4 `abandonMigration()` — available until the adopting decision, keeps drafts, keeps the re-affirmation decisions, touches nothing adopted. The screen says so, because a community that thinks abandoning erases twenty decisions will not abandon when it should
- [ ] 6.5 Tests: starting changes nothing in force; a decision frozen mid-migration is recorded against the old version; adoption with pending items is refused and says how many; abandoning leaves the register and the adopted definitions untouched

## 7. Adopting the new version

- [ ] 7.1 `adoptVersion()` in one transaction: carried-forward definitions re-pointed at the new row, removed ones kept and marked no longer required, `clause_coverage` rebuilt, the old row retired, the new one active, one change-log entry, and the decision referencing every re-affirmation
- [ ] 7.2 `decision_clause` is not touched. A decision keeps the version, ref and key it quoted; where it helps, the *rendering* resolves "now `core@0.2 · 5.3.4`" through the map at display time rather than storing a fact that has to be kept true
- [ ] 7.3 Permalinks survive: `/c/{slug}/d/DEC-2026-014` resolves to the same decision afterwards
- [ ] 7.4 Exports state the version on every page, which they already do — the task is asserting it survives a migration
- [ ] 7.5 Tests: the register serialised whole before and after, compared row for row; a removed clause's definition is kept and marked; coverage matches the new version; a permalink resolves; **mutation-checked** by rewriting `decision_clause` to the new refs and watching the history test fail

## 8. The path, and the surfaces that assume core

- [ ] 8.1 Module clauses rank below core by default, with the weight visible and editable like the others and the standard named among an item's stated reasons
- [ ] 8.2 Find every surface that assumes one standard — the dashboard, the artifact pages, the exports, the audit, the self-audit — with a registry test in the shape P6 and P7 both used, so one missed is a failing suite rather than a screen that shows core figures for a module
- [ ] 8.3 Tests: the registry fails when a surface is added and not listed; the path shows module items below core ones; changing the weight changes the order and is recorded

## 9. Closing it

- [ ] 9.1 The group 0 exit spec passes end to end
- [ ] 9.2 A consolidated mutation pass over the phase's guards — the claim computed from core alone, the strictest-class rule, the untouched `decision_clause`, the partial index, the migration-map validator. Break each, watch the *right* test fail, restore
- [ ] 9.3 Update `docs/09-standards-versions-modules.md` §6 to say what was built rather than what was prepared, and `docs/08-roadmap-mvp.md`'s P8 section to what shipped — including, plainly, that the content half is still waiting on upstream
- [ ] 9.4 Write down what the fixtures assume about a real migration map, so that whoever receives upstream's first one knows what to check it against

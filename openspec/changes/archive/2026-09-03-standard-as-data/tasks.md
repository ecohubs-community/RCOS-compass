## 1. The generator, in the RCOS-website repository

- [x] 1.1 `scripts/build-standard-data.mjs` — parse `content/articles/rcos-core/v0-1/` chapters 2–8 into clauses with ref, key, layer, normativity and text
- [x] 1.2 Parse `content/articles/rcos-templates/` into artifacts and sections, carrying clause references, rationale, instructions and placeholders
- [x] 1.3 Parse Appendix A into glossary terms
- [x] 1.4 Emit all five locales, with a documented fallback when a translation is absent
- [x] 1.5 Emit `static/downloads/standard/rcos-core/0.1/*.yaml` plus `manifest-standard.json` with a sha256 per file and the CC BY 4.0 licence line
- [x] 1.6 Verify against the source: 213 clauses, 22 artifacts, ~118 sections

## 2. The authored half: ownership and dispositions

- [x] 2.1 Resolve the 57 multiply-claimed clauses — mechanically where the sections share an artifact, by judgement where they do not
- [x] 2.2 Disposition the 12 unmapped MUST clauses as `satisfied_by_platform` or `not_a_definition`, each with an explanation
- [x] 2.3 Resolve the 25 sections that carry no clause reference — each now carries a section disposition (`authored` 94, `filled_from_decision` 19, `instance_record` 4, `derived` 1); reasoning in `docs/12-clause-ownership-report.md`
- [x] 2.4 `content/standard-data/rcos-core-0.1/ownership.yaml`, consumed by the generator so the judgement is reviewable and the script stays pure
- [x] 2.5 `docs/12-clause-ownership-report.md` — every decision with its reasoning, for Stefan to correct

## 3. Vendoring into Compass

- [x] 3.1 `standard/rcos-core/0.1/` vendored, with `meta.yaml` recording the upstream sha256 per file
- [x] 3.2 `scripts/check-standard.mjs` — hash check plus the ownership invariant, wired into `pnpm lint` and CI as the first check
- [x] 3.3 Tests: an edited vendored file fails the hash check; a doubly-owned clause fails validation; an unowned `defined_by_section` clause fails

## 4. The loader

- [x] 4.1 `src/lib/server/standard/` — parse once, cache, address by `(standard_id, version)`, never assume core 0.1 is alone
- [x] 4.2 Typed accessors: clause by key, section by key, artifact with its sections, countable clauses, glossary
- [x] 4.3 Locale resolution with recorded fallback
- [x] 4.4 Tests: two standards load side by side; unknown standard reports clearly; repeated reads parse once; countable excludes SHOULD, MAY and non-`defined_by_section`; missing translation falls back and says so

## 5. Compass's own annotations

- [x] 5.1 `standard/rcos-core/0.1/annotations.yaml` — plain-language question, effort tag and dependency edges per section. Compass's opinion, kept separate from the standard's own data
- [x] 5.2 Author Layers 0 and 1 (~20 sections), which is what P3 and the pilot's first month need
- [x] 5.3 Tests: every annotated section exists in the standard; a dependency edge cannot name a section that does not exist; annotations are optional, and a section without them still loads

## 6. Proving it

- [x] 6.1 A script that prints readiness for a synthetic community, so the arithmetic is exercised before any screen exists
- [x] 6.2 A second, fake standard id loads alongside core with no code change — the module door, proved open

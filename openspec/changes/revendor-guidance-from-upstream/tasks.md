## 1. Re-vendor

- [x] 1.1 `git pull --ff-only` on `main`; branch `revendor-rcos-website-phase-9`
- [x] 1.2 Diff Compass's English annotations against the published English `question`/`prompts`/`examples` (102 sections, 0 differences) before deleting anything
- [x] 1.3 Copy every file in RCOS-website's `manifest-standard.json` into `standard/` byte for byte (adds `specSections.yaml`, `schema.json`); the manifest becomes `standard/upstream-manifest.json`
- [x] 1.4 Confirm no structural change: clause, section and artifact keys, refs, owners and dispositions identical

## 2. Read guidance from the standard

- [x] 2.1 Types: `Section.i18n` gains optional `question`/`prompts`/`examples`; `Annotation` keeps `effort` and `dependsOn`
- [x] 2.2 `StandardView.guidance(key, locale)` with per-field fallback to the default locale
- [x] 2.3 `questionFor` and `guideFor` read it in the community's locale; workspace clause picker too; mapping prompt stays English
- [x] 2.4 `annotations.yaml`: remove the three fields from every entry; header says where they went

## 3. Checks

- [x] 3.1 `check-standard.mjs`: default-locale question on every authored section from `sections.yaml`; prompts/examples non-empty in every locale; annotations refuse fields other than `effort`/`dependsOn`; integrity and ownership unchanged
- [x] 3.2 Tests (unit): the check fails on a missing question and on an empty German prompt (naming section and locale), refuses a `question` in the annotations, fails on a dependency into nothing; passes as vendored
- [x] 3.3 Tests (unit): guidance in German for a German community; per-field fallback to English; every authored section has a question ending in "?"; annotations hold only effort and dependsOn; `guideFor`/`requirementFor` give German prompts, examples and sibling questions

## 4. Docs and shipping

- [x] 4.1 `docs/00-architecture.md` §2 layout, `docs/08-roadmap-mvp.md` P1 note
- [x] 4.2 `pnpm version patch --no-git-tag-version` (0.15.0 → 0.15.1)
- [x] 4.3 `pnpm check:standard`, `pnpm check`, `pnpm test`, `pnpm lint` pass

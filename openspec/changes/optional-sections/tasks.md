## 1. Re-vendor

- [x] 1.1 Copy every file in RCOS-website's `manifest-standard.json` into `standard/` byte for byte; the manifest becomes `standard/upstream-manifest.json`
- [x] 1.2 Confirm no structural change: clause, section and artifact keys, owners, dispositions and clause text identical; differences are `optional`, 32 `clauseRefs`, two disposition notes, one section's i18n (Non-Goals note), 12 artifact summaries

## 2. Required versus authored

- [x] 2.1 Types: `Section.optional: boolean`
- [x] 2.2 `StandardView.requiredSections()` and `requiredSectionsOf(key)`; `counts().requiredSections`
- [x] 2.3 Completeness, claim, self-audit, Path and Ratification Record read the required set
- [x] 2.4 Artifact page: `optional` on each section; optional sections writable, labelled, never segments or blockers
- [x] 2.5 Standard page: label, counts of required sections, gaps filter skips optional sections
- [x] 2.6 Messages: `section_optional` (en, de, es)

## 3. Checks

- [x] 3.1 `check-standard.mjs`: boolean `optional`; authored only; owns no MUST; a mandatory artifact has a required section
- [x] 3.2 Tests (unit): every section says whether it is optional; only Non-Goals is; required set is 93 and excludes it; no optional section owns a MUST; the check fails when Secondary Purposes is made optional
- [x] 3.3 Tests (integration): artifact page counts 3 of the Purpose Charter, lists Non-Goals as optional and never as a blocker, adopting it moves nothing; the Path has 93 items and no Non-Goals; Non-Goals can still be discussed and adopted without moving readiness or completeness; compliance holds without it
- [x] 3.4 Tests that used Non-Goals as "a Path item owning no clause" use Membership Agreement → Due Process Reference instead

## 4. Docs and shipping

- [x] 4.1 `docs/03-data-model.md` §3b
- [x] 4.2 `pnpm version minor --no-git-tag-version` (0.15.1 → 0.16.0)
- [x] 4.3 `pnpm check:standard`, `pnpm check`, `pnpm test`, `pnpm lint` pass
- [x] 4.4 e2e (desktop, fresh `pnpm build`): artifact detail says 0 of 3 and shows "Optional — not counted"; Path specs use Due Process Reference; definitions index and artifacts list

## 1. One rule

- [x] 1.1 `restrictedInClosedLayers(db, communityId, communityStandardId, view)` in `layer-checks.ts`: adopted standard-scope definitions, restricted, in a layer whose artifact rule allows no exception; the accessibility check uses it too
- [x] 1.2 `compliance()`, `outwardClaim()` and the self-audit read it: compliant only when it is empty; the claim and `Compliance` carry a count, the audit snapshot carries the list

## 2. Surfaces

- [x] 2.1 Public page: "N rules every member must be able to read are restricted" when N > 0, no titles; audit page lists them; layer-checks compliance note and help updated; copy in `messages/*.json`

## 3. Tests

- [x] 3.1 Integration: complete-and-clean community is compliant; restricting a Layer 0 definition makes `compliance()`, `outwardClaim()` and a new self-audit not compliant, with count 1 and no title in the claim; a Layer 3 definition restricted under a live exception keeps compliance; a local restricted definition and another community's are ignored; an old snapshot without the field still renders
- [x] 3.2 Update `layer-checks.test.ts`'s "does not change compliance" to the new rule, and keep an informing-only case (linter findings)

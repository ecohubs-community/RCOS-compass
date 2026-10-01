## 1. Content and checks

- [x] 1.1 `Annotation` type gains optional `prompts` and `examples`
- [x] 1.2 `check-standard.mjs` rejects a non-list or an empty entry in either
- [x] 1.3 `annotations.yaml`: the prompts, examples and rewordings in `design.md` §4 and the proposal
- [x] 1.4 Tests (unit): the check fails on an empty prompt and names the section; passes as vendored

## 2. Read and render

- [x] 2.1 `guideFor(view, sectionKey, locale)`: prompts, Compass examples, filtered template hints; null when empty
- [x] 2.2 `<QuestionGuide>`; discussion header ("What to cover", collapsed) and definition page; copy in `messages/*.json`
- [x] 2.3 Tests (unit): voluntary exit returns its prompts, the Compass example and the 24-hours template hint, registered authorities drops table cells like "e.g. Finance Steward"; German template hints in a German community; a section with nothing returns null
- [x] 2.4 Tests (e2e): opening "What to cover" in a voluntary-exit thread shows the prompts and both kinds of example with their labels; works with no JavaScript; a section without guidance shows no control

## 3. Shipping

- [x] 3.1 `pnpm version minor --no-git-tag-version` (0.9.0 → 0.10.0)
- [x] 3.2 `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` pass

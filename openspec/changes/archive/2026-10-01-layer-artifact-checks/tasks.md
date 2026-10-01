## 1. Service

- [x] 1.1 `layer-checks.ts`: the property map keyed by clause key; `layerChecks(ctx, { db })` computing complete, versioned, accessible, ratified, explicit, maintained over adopted standard-scope definitions per layer, with failing items (title, definition id, detail)
- [x] 1.2 Tests (integration): fresh community (complete not met with the four Layer 0 artifacts; others "nothing adopted yet"); Layer 2 has no ratified check and Layer 5 has maintained; restricted Layer 0 definition → accessible not met; restricted Layer 3 definition under a live exception → met, listed with its end date; restricted Layer 3 definition with an expired exception → not met; provisional → ratified needs attention; version without decision → not met; unclean and unlinted versions counted under explicit; Layer 5 past review → needs attention, none → not met; a local definition is ignored; another community's data is ignored; an observer is refused; compliance unchanged by a failing accessibility check

## 2. Page

- [x] 2.1 Standard page load calls `layerChecks`; markup renders one block per layer above its first artifact, words + icon per result, `<ClauseRef>` links, `<details>` with failing items linked; `<HelpTip id="layer-checks">`; copy in `messages/*.json`
- [x] 2.2 Tests (e2e, desktop and 375px): a fresh community's standard page shows a Checks block per layer, Layer 0's completeness "Not met" naming the Purpose Charter; the help opens by keyboard; axe passes

## 3. Shipping

- [x] 3.1 `pnpm version minor --no-git-tag-version` (0.10.1 → 0.11.0)
- [x] 3.2 `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` pass

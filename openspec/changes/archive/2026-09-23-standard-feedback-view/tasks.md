## 1. Reading the feedback

- [x] 1.1 `listStandardFeedback(ctx)` in `src/lib/server/services/standard-feedback.ts`: `community.read`, filtered on `ctx.community.id`, entries on a definition the reader may not see dropped through `visibleTo` in the query, newest first, the author named through `personLabel` via their membership in this community, the clause ref resolved from the pinned standard
- [x] 1.2 `standard-feedback.ts` in `tests/support/person-surfaces.ts`
- [x] 1.3 Tests (integration): happy path newest first with author and link target; a role without `community.read` refused; another community's entries never listed; an entry on a restricted definition hidden from a member and shown to a steward; a deleted definition's entry still listed without a link; an erased author reads as a former member

## 2. The settings panel

- [x] 2.1 Route `/c/[slug]/settings/standard-feedback`: load calls `requirePermission(ctx, 'community.read')` and the service, shapes the rows
- [x] 2.2 `links.standardFeedback`, a panel in the settings layout, copy in `messages/en.json` (de/es fall back and are reported as untranslated)
- [x] 2.3 Page: a plain list, newest first, each entry linking to its definition or clause; an empty state saying how an entry is recorded; works at 375px; i18n ratchet not raised
- [x] 2.4 The route in `tests/support/routes.ts` (walked by the accessibility scan); passes `route-guards`
- [x] 2.5 Tests: e2e — a member sees an entry recorded by another member with its author and a working link, and the empty state on a fresh community; the seed route gains `standardFeedback` to record one through `createDefinition`

## 3. The export

- [x] 3.1 `buildBundle` writes `standard-feedback.md` and `standard-feedback.json` through the same service, lists them in the readme and manifest
- [x] 3.2 Tests (integration): the files carry the entry; an empty community's files say there is none; an entry on a restricted definition is absent for an exporter who may not see it; no erased name in the files

## 4. Shipping

- [x] 4.1 Version bump `0.1.0 → 0.2.0` (a new capability a member can use)
- [x] 4.2 `pnpm check`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, the e2e spec

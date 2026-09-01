## Why

Twelve design documents and no code. Every decision that matters has been made
and reviewed over eight passes — but nothing has been proved by running.

The three things this change exists to prevent, in order of how expensive they
are to fix later:

1. **A codebase where tests are optional.** The project's one process rule is
   *nothing ships untested* (`docs/06-testing-strategy.md` §1). A rule like that
   holds only if writing a test is the path of least resistance on day one. If
   the harness arrives in week three, the first twenty commits set the real
   culture and the rule becomes a document nobody follows.
2. **Config and jobs discovered late.** `docs/00-architecture.md` §6 admits the
   MVP is single-instance because of the in-process worker, and §10 requires the
   app to refuse to boot on bad config. Both are cheap now and structural later —
   a background job added in P4 against no runtime becomes a `setTimeout`.
3. **A design system assembled from screens.** `docs/02-component-guidelines.md`
   only works if the tokens and the first primitives exist before anyone is under
   deadline building the dashboard.

What a community loses if this is skipped: nothing visible — and that is the
point. This change buys no feature. It buys the conditions under which the
features that follow are correct, testable, and safe to change. Skipping it does
not cost a community a screen; it costs them, months later, a decision record
that is subtly wrong and a test suite that never would have caught it.

## What Changes

- A running SvelteKit 2 / Svelte 5 / Tailwind 4 / Bits UI application that
  renders one page and nothing more.
- **Typed, validated runtime configuration** that fails to start rather than
  starting wrong, with `.env.example` and no `process.env` access anywhere else.
- **The request pipeline**: request id, security headers with a CSP nonce,
  structured logging with no content in it, the error-response shape, `/healthz`.
- **The background job runner**: a SQLite job table, an in-process worker, at
  least-once delivery with backoff and a dead-letter state.
- **The full test harness before any feature**: Vitest, Playwright, the seven
  environments of `docs/06-testing-strategy.md` §2, injectable clock, seeded
  UUIDs, `fixture` and `null` AI providers, memory mail transport, and CI green
  on all of it.
- Design tokens in `app.css`, the first two primitives (`Button`, `StatusChip`),
  and the `/dev/components` gallery — so the design system exists before the
  screens do.
- Docker image that boots, migrates, and serves.
- `LICENSE.md` is already in place; the README licensing paragraph is written.

Out of scope, deliberately: any database table other than `job`, authentication,
tenancy, and every screen in the product spec.

## Capabilities

### New Capabilities
- `runtime-config`: how the application reads, validates and refuses bad configuration
- `background-jobs`: the job table and worker — at-least-once delivery, retry, dead-letter
- `request-pipeline`: request identity, security headers, error shape, health endpoint

### Modified Capabilities
<!-- none — this is the first change -->

## Impact

- Creates the repository's entire source tree; touches no existing behaviour
  because there is none.
- Sets the constraints every later change inherits: single instance,
  migrations at boot, services-not-routes, tests in the same commit.
- Design files diverge from the spec in six places
  (`docs/07-spec-review-log.md`, "Design files that no longer match the spec").
  Updating them is tracked here as a task, not as code.
- Relies on: `docs/00-architecture.md` §2, §6, §7, §10, §11 ·
  `docs/01-server-client-contract.md` §4–5 ·
  `docs/02-component-guidelines.md` §5, §5a ·
  `docs/06-testing-strategy.md` §1–2 · `docs/08-roadmap-mvp.md` P0.

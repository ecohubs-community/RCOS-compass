## 1. Repository and toolchain

- [x] 1.1 `pnpm create svelte` — SvelteKit 2, Svelte 5, TypeScript strict; pin exact versions for the framework tier
- [x] 1.2 Tailwind 4 with `@theme` tokens in `app.css` from `docs/02-component-guidelines.md` §5 — no `tailwind.config.js`, no hex values outside this file
- [x] 1.3 ESLint 9 flat config + Prettier + `svelte-check`; boundary rule forbidding `$lib/server/*` imports from `.svelte`, and a rule forbidding `process.env` outside the config module
- [x] 1.4 `pnpm check` green on an empty app
- [x] 1.5 CI pipeline: check → lint → unit → integration → build; green before anything else lands

## 2. Runtime configuration

- [x] 2.1 `src/lib/server/config.ts` — valibot schema over `process.env`, parsed once at boot, exits non-zero on failure with the offending variable named
- [x] 2.2 `.env.example` with every variable from `docs/00-architecture.md` §10, values omitted
- [x] 2.3 `isPlatformAdmin(email)` — verified email, trimmed, case-insensitive, compared per request, never cached
- [x] 2.4 Tests: missing required, wrong type, absent optional, secret absent from the client bundle, admin matching including case and whitespace, and the lint rule firing on a stray `process.env`

## 3. Database and migrations

- [x] 3.1 Drizzle + better-sqlite3, WAL mode, connection module; migrations run at boot (safe only while single-instance — note it in the file)
- [x] 3.2 UUIDv7 helper and the epoch-ms timestamp convention from `docs/00-architecture.md` §5
- [x] 3.3 `job` table — the only table this change adds
- [x] 3.4 Tests: migrations apply to an empty database; a second boot is a no-op; ids sort chronologically

## 4. Background jobs

- [x] 4.1 Job service: enqueue, claim with visibility timeout, complete, fail with exponential backoff, dead-letter after 5 attempts
- [x] 4.2 In-process worker with graceful shutdown; one trivial handler end to end
- [x] 4.3 Tests: enqueue-and-run, restart mid-job re-claims, double-claim is harmless, retry backoff, dead-lettering, wall-clock timeout, and a post-commit failure leaving committed data untouched

## 5. Request pipeline

- [x] 5.1 `hooks.server.ts` — request id, security headers with a CSP nonce, structured logging (pino) carrying no content
- [x] 5.2 `handleError` returning a generic message plus the request id; error page keeps the shell
- [x] 5.3 `/healthz` — build SHA, migration version, database reachability, nothing else
- [x] 5.4 IP-based rate limiting in SQLite, ready for the per-user layer in P2
- [x] 5.5 Tests: headers on every response type, nonce enforcement, no stack traces or SQL in a 500, no content in logs, `/healthz` shape, non-200 when the database is down

## 6. Test harness — before any feature, not after

- [x] 6.1 Vitest: unit and integration projects; temp SQLite file per suite, migrated fresh, deleted after
- [x] 6.2 Playwright: chromium pre-merge, firefox and webkit nightly; viewport matrix 375 / 768 / 1024 / 1440
- [x] 6.3 Injectable clock (`ctx.now()`), seeded UUID generator, `TZ=UTC` in CI
- [x] 6.4 `null` and `fixture` AI providers; memory mail transport; a test that fails if anything reaches the network
- [x] 6.5 The seven environments of `docs/06-testing-strategy.md` §2 configured and documented in the README
- [x] 6.6 A deliberately failing test in each layer, to prove CI actually fails — then removed in the same commit

## 7. Design system beginnings

- [x] 7.1 Tokens in `app.css`; resolve the muted-contrast decision from `docs/02-component-guidelines.md` §6 before any screen uses it
- [x] 7.2 `Button` and `StatusChip` as Bits UI-backed primitives with a variant map; `StatusChip` driven by the single status vocabulary
- [x] 7.3 `HelpTip` plus the help registry skeleton (`docs/02-component-guidelines.md` §5a) — click/tap operable, not hover-only
- [x] 7.4 `/dev/components` gallery rendering every state, dev-only
- [x] 7.5 Tests: component states, keyboard operation, axe pass on the gallery at all four viewports

## 8. Packaging and documentation

- [x] 8.1 Dockerfile: boots, migrates, serves, mounted volume for the database
- [x] 8.2 CI smoke test of the image — boot, migrate, hit `/healthz`
- [x] 8.3 README: licensing paragraph (already written), how to run, how to test, the seven environments

## 9. Non-code carry-over from P0

- [ ] 9.1 *(with Stefan — in progress)* Update the design files for the six divergences listed at the end of `docs/07-spec-review-log.md`
- [x] 9.2 Confirm the RCOS-website export approach for the standard YAML generator (P1 depends on it)

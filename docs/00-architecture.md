---
status: draft for discussion
version: 0.1
date: 2026-08-31
relates_to: ../UI Spec — v0.1 (draft).md
---

# RCOS Compass — Architecture & Tech Stack

Scope: what we build with, how the pieces fit, and the constraints that keep the
post-MVP options (Postgres, Tauri, self-hosting, local AI) cheap.

---

## 1. Stack

Versions are the latest published as of 2026-08-31. Pin exact versions in
`package.json`; upgrade deliberately, never with `^` drift on the framework tier.

| Concern | Choice | Version | Why |
|---|---|---|---|
| Spec workflow | **OpenSpec** | CLI, global | Spec-driven development: every non-trivial change starts as a proposal under `openspec/changes/`. Matches a product whose whole thesis is "explicit beats implicit". |
| Framework | **SvelteKit** | 2.70.x | SSR by default, form actions, one deploy artifact. The app is member-authenticated and server-rendered — §1.6 of the UI spec depends on it. |
| Language | **Svelte 5 (runes)** | 5.57.x | `$state` / `$derived` / `$props`. No stores in component code except the few documented cross-cutting ones. |
| UI primitives | **Bits UI** | 2.19.x | Headless, accessible, Svelte 5 native. We own the styling; they own the ARIA and focus management. |
| Styling | **Tailwind CSS** | 4.3.x | CSS-first config (`@theme` in `app.css`), no `tailwind.config.js`. See `02-component-guidelines.md` for the no-custom-CSS rule and its narrow exceptions. |
| DB (MVP) | **SQLite** | via `better-sqlite3` | Single file, trivially self-hostable, ships in the Docker image. WAL mode. |
| DB (post-MVP) | **PostgreSQL** | 16+ | Only when a hosted multi-tenant deployment needs it. See §5 for the portability rules that make this a config change, not a rewrite. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | 0.45.x | Typed schema, SQL-shaped, generated migrations checked into git. |
| Auth | **better-auth** | 1.7.x | Email+password and magic-link, sessions in DB, organization-shaped multi-tenancy, invitations. |
| Validation | **Valibot** | 1.x | Every server boundary. Smaller than Zod, same ergonomics; one schema per action, exported for tests. |
| AI | **Provider interface + Google AI Studio adapter** (`@google/genai` 2.20.x) | | See §4. Never called from the browser. |
| Email | **Nodemailer over SMTP**, with a Resend adapter behind the same interface | 9.1.x | *Added in review — the spec promised invites and review-date nags with no way to send them.* |
| Testing | **Vitest** 4.1.x, **Playwright** 1.62.x | | See `06-testing-strategy.md`. |
| Lint/format | ESLint 9 flat config, Prettier, `svelte-check` | | |
| Runtime | Node 24 LTS, pnpm 10 | | |
| Packaging | Docker image (app + SQLite volume) | | The self-host promise in UI spec §2. |
| Desktop (post-MVP) | **Tauri 2** | | Wraps the same frontend against a remote server. Constrains nothing today except §2's "services, not routes" rule. |

**Deliberately not in the stack:** a component library with opinions (shadcn-svelte
is fine to copy patterns from, not to depend on), a state-management library,
tRPC/GraphQL (SvelteKit's own boundary is the API), a CSS-in-JS layer, Redis
(SQLite handles MVP rate-limit and job state), Prisma.

---

## 2. Shape of the codebase

```
openspec/                    proposals + capability specs (source of truth for behaviour)
docs/                        these documents
standard/                    RCOS as data — YAML, versioned (UI spec §8, docs/09)
  rcos-core/0.1/             clauses.yaml, sections.yaml, artifacts.yaml, glossary.yaml
  rcos-module-*/<version>/   same shape — post-MVP content, MVP-ready loader
  migrations/                core-0.1-to-0.2.yaml … (empty now, schema validated in CI)
  schema.json                validated in CI
src/
  lib/
    server/                  NEVER importable from a .svelte file
      db/schema/*.ts         drizzle tables, one file per bounded area
      db/index.ts            connection, migrations at boot
      services/*.ts          ALL business logic. Pure-ish, takes a ctx, returns data
      auth/                  better-auth config, guards, permission matrix
      ai/                    provider interface + adapters (§4)
      standard/              multi-standard, multi-version loader + cache
      audit.ts               append-only audit log writer
    components/
      ui/                    primitives — thin Bits UI wrappers (Button, Dialog, …)
      rcos/                  domain components (StatusChip, ClauseRef, ReadinessBar, …)
    shared/                  types + valibot schemas usable on both sides
  routes/
    (public)/                anonymous: marketing, /c/[slug]/public/*
    (app)/c/[slug]/          tenant-scoped, member-authenticated
    (admin)/admin/           platform admin (05-admin-console.md)
    api/                     only the endpoints §2 of 01-server-client-contract allows
  hooks.server.ts            session, tenant resolution, rate limit, security headers
tests/
  unit/ integration/ e2e/ fixtures/
```

**The one structural rule:** route files (`+page.server.ts`, `+server.ts`) contain
*no* business logic. They parse input, call a service in `src/lib/server/services`,
and shape the response. Everything a route can do, a script, a test, a future
Tauri client, or a background job can do by calling the same service. This is
what makes the post-MVP transports free.

---

## 3. Multi-tenancy

- **Tenant = community.** Every tenant-owned table carries `community_id`, not
  nullable, indexed first in every composite index.
- **The tenant comes from the URL** (`/c/[slug]/…`) and is resolved once in
  `hooks.server.ts` into `locals.community` + `locals.membership`. A request with
  no membership for that community 404s (not 403 — do not confirm existence).
- **Never accept a `communityId` from the client.** Services take the resolved
  community from a `ctx` object; a service that queries without a community
  filter is a bug that the tenant-isolation test suite is designed to catch.
- Users may belong to many communities with a different role in each.
- The community switcher changes the URL. There is no "active tenant" in the
  session — session-held tenancy is how cross-tenant leaks happen.

---

## 4. AI provider abstraction

```ts
// src/lib/server/ai/provider.ts
export interface AiProvider {
  readonly id: string;                       // 'google' | 'openai-compatible' | 'null'
  complete(req: AiRequest): Promise<AiResult>;
  stream?(req: AiRequest): AsyncIterable<string>;
}
export interface AiRequest {
  task: AiTask;            // 'map-document' | 'lint-definition' | 'plain-language' | 'summarise-thread'
  system: string;
  input: string;           // ALWAYS treated as untrusted data (see 04-security.md §5)
  json?: object;           // response schema when structured output is required
  maxOutputTokens: number;
}
export interface AiResult { text: string; parsed?: unknown; usage: { in: number; out: number }; model: string; }
```

Rules:

1. **Server-only.** No API key ever reaches the browser. AI responses reach the
   client through a normal load/action or an SSE endpoint we own.
2. **Selected by env**, not by code: `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`,
   `AI_BASE_URL`. A community may override the provider in settings (UI spec
   §4.9); a self-hosted instance may point `AI_BASE_URL` at a local Ollama.
   Swapping Google AI Studio for Tinfoil or an OpenAI-compatible endpoint is a
   `.env` change plus one adapter file.
3. **`null` provider is a first-class option.** Every AI feature must degrade to
   a manual path (UI spec §6.1 already says this for document mapping). CI runs
   with `AI_PROVIDER=null`.
4. **AI is off by default on a new community.** Enabling it is an explicit act by
   an owner or steward, on a screen that names the provider and states its data
   terms. The reason is specific: governance drafts are among the most sensitive
   text a community holds, and some hosted model tiers reserve the right to train
   on submitted prompts. Use a tier with no-training terms, and say which one it
   is in the settings screen rather than in a policy nobody reads.
5. **Every call is logged** — task, tenant, actor, model, token counts, latency,
   and a hash of the input — to the `ai_call` table. Per-community monthly token
   budget with a hard stop and a visible usage figure in settings.
6. **Prompts live in `src/lib/server/ai/prompts/*.ts`** as exported constants, are
   versioned, and are covered by fixture tests. Never build a prompt inline in a
   service.
7. **No AI call may write state.** AI output becomes a *suggestion row* that a
   human confirms. This is a code-level invariant, not a UI convention.

---

## 5. Data-layer portability (SQLite now, Postgres later)

Follow these and the migration is a driver swap:

- **IDs are application-generated UUIDv7 strings**, never `AUTOINCREMENT`. Sortable,
  portable, safe to expose. (Exception: the per-tenant decision sequence — see `03-data-model.md` §6.)
- **Timestamps are integer epoch-milliseconds** (`integer({ mode: 'timestamp_ms' })`).
  No SQLite date functions, no locale-dependent text dates.
- **Booleans are integers** via Drizzle's `mode: 'boolean'`.
- **No raw SQL outside `src/lib/server/db`.** Where raw SQL is unavoidable
  (FTS5, recursive CTEs), it lives behind an interface with one file per engine.
- **Full-text search is behind `SearchIndex`** — FTS5 today, `tsvector` later.
  Nothing else in the app knows how search is implemented.
- **JSON columns are allowed** for open-ended blobs (linter results, AI usage
  metadata) but never for anything we filter or join on.
- Money-like values (spending thresholds inside definitions) are text inside
  definition bodies, not typed columns. We do not do accounting (UI spec §9).

---

## 6. Background jobs, and the single-instance constraint

Four things must happen outside a request: document extraction, the git mirror
push, export bundle generation, and the nightly expiry/review sweeps. They need a
runtime, and the spec previously said "a job" without saying what runs it.

**A `job` table in the same SQLite database, worked by an in-process runner.**
Rows carry `kind`, `payload`, `run_after`, `attempts`, `locked_until`,
`last_error`. The worker claims with a visibility timeout, retries with
exponential backoff, and gives up after 5 attempts into a dead-letter state
visible on `/admin/status`. **Every job handler must be idempotent** — delivery is
at-least-once, and a git push or an export that runs twice must be harmless.

The honest consequence: **the MVP runs as a single instance.** SQLite plus an
in-process worker plus in-process rate limiting means one process, vertically
scaled. That is fine for the pilot and for self-hosting, and it is the reason the
portability rules in §5 exist — the day horizontal scaling matters, Postgres and
an external queue are the change, not a rewrite. Migrations run at boot, which is
only safe because there is one instance; when that stops being true, migrations
move to a release step.

## 7. Deployment target and URL shape

- **`adapter-node` on a VPS with a mounted volume** (Hetzner/Coolify-shaped), not
  a serverless platform. Serverless would force libSQL/Turso or Postgres on day
  one and break the in-process worker — a real decision, made here so nobody
  discovers it during P2.
- **Path-based tenancy** — `app.example.org/c/valle-verde/…`. One origin, one
  cookie, no wildcard TLS, no subdomain-scoped session bugs.
- **Leave room for community sites on their own domains.** A community publishing
  its governance at `governance.theircommunity.org` is a real post-MVP ask
  (UI spec §7). Three things keep it cheap, and all three are free today:
  the `(public)` route group is already separate from the authenticated app;
  host-based tenant resolution is **additive** — `hooks.server.ts` resolves the
  community from the path *or*, if the request Host matches a verified custom
  domain, from that — and it must never become the *only* path; and every colour,
  font and spacing value is already a token, so theming is a token file rather
  than a refactor. Do not build any of it now. Do not close the door either.
- **Browser support:** current and previous versions of Chrome, Firefox, Safari
  and Edge. No polyfills for older engines. Accessibility target is **WCAG 2.1 AA**,
  stated so it can be tested rather than aspired to.

## 8. Document toolchain

Named here so the choice is deliberate and CSP-compatible:

- **PDF text extraction:** `unpdf` / `pdfjs-dist` in a worker.
- **DOCX:** `mammoth` to HTML, then sanitised to text + structure.
- **Viewer:** self-hosted `pdfjs-dist` — no CDN, per the CSP in `04-security.md` §7.
- **PDF generation** (export bundle, printable register): render the app's own
  print stylesheet to PDF with headless Chromium via Playwright, which is already
  a dependency. Revisit if the memory cost bites.
- **No OCR in MVP.** A PDF with no text layer is detected on upload and the
  member is told plainly: *"This looks like a scan — Compass can't read it. You
  can still attach passages by hand."* Silent zero-passage extraction would be
  read as a bug.

## 9. Durability, backup, git mirror

- SQLite in WAL mode on a mounted volume; nightly `VACUUM INTO` snapshot plus
  Litestream-style continuous replication when hosted.
- **Git mirror (UI spec §8.1)** runs as a *background job after* a freeze
  commits, never inside the freeze transaction. A failed push is retried with
  backoff, surfaced in settings, and never blocks governance. Restricted-visibility
  content is excluded from the mirror unless the community opts in explicitly.
- **Full export** (JSON + Markdown + PDF bundle) is a background job with a
  signed, expiring download link. It is a stated product promise, so it is
  covered by an e2e test.
- **Uploaded files are backed up with the database, not separately.** A restore
  that brings back decisions but loses the bylaws they were mapped from is a
  broken restore. The quarterly drill restores both and re-opens a mapped document.

---

## 10. Configuration

All server config is read through one typed, validated module
(`src/lib/server/config.ts`) that parses `process.env` with valibot at boot and
**fails to start** on a missing or malformed required variable. No `process.env`
access anywhere else.

```
# .env.example
PUBLIC_APP_URL=http://localhost:5173
ORIGIN=http://localhost:5173   # same address; required in production (see below)
DATABASE_URL=file:./data/compass.db
BETTER_AUTH_SECRET=            # 32+ random bytes, required
ADMIN_EMAILS=                  # comma-separated; platform admins (05-admin-console.md)
AI_PROVIDER=null               # null | google | openai-compatible
AI_MODEL=gemini-2.5-pro
AI_API_KEY=
AI_BASE_URL=
AI_MONTHLY_TOKEN_BUDGET=2000000   # per community, backstop
AI_USER_MONTHLY_TOKENS=300000     # per user — the primary control
AI_USER_DAILY_TASKS=25
MAX_UNZIP_MB=200
MAX_EXTRACT_PAGES=300
EXTRACT_TIMEOUT_S=120
UPLOAD_PER_USER_HOUR=10
UPLOAD_PER_USER_DAY=40
UPLOAD_PER_COMMUNITY_DAY=60
STORAGE_MB=2048
SMTP_URL=                      # or RESEND_API_KEY
MAIL_FROM="RCOS Compass <no-reply@example.org>"
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_MB=25
LOG_LEVEL=info
```

**`ORIGIN` is not optional in production.** `adapter-node` builds `event.url`
from it, and left unset it assumes `http://localhost`. SvelteKit then compares
that against the browser's real `Origin` and refuses every form submission with
a bare 403 — no log line, no message. The config module therefore requires it in
production and requires it to equal `PUBLIC_APP_URL`, so the failure is a boot
error rather than an unexplained 403 on the first sign-in.


`ADMIN_EMAILS` is compared against the user's **verified** email, lower-cased and
trimmed, on every request — never cached in a session claim, so revoking an admin
is a restart, not a session hunt.

---

## 11. Observability

Structured JSON logs (pino) with `requestId`, `communityId`, `userId` on every
line; never log definition bodies, discussion text, or document contents.
`/healthz` returns build SHA, migration version, and DB reachability.
Errors go to a Sentry-compatible endpoint with PII scrubbing on.

---

## 12. Product analytics

Privacy-first product, so: **no third-party analytics, no session recording, no
tracking cookies.** But shipping onboarding blind is also a choice, and a bad one.

The middle path: a handful of **funnel counters written to our own database** —
community created, setup interview completed, first document uploaded, first
mapping confirmed, first definition adopted, fifth definition adopted, first
export — aggregated per community, no per-member behavioural data, readable on
`/admin/status`. That is enough to answer "does onboarding work?" and nothing more.
If a self-hosted instance wants even that off, one env flag.

## 12a. Licensing, hosting, legal

Summarised here because they touch the build; the reasoning and the documents
they imply are in `10-legal-and-operations.md`.

- **App licence: PolyForm Noncommercial 1.0.0.** `LICENSE` at the repo root in
  P0, named in the footer and in every export. It is not an OSI open-source
  licence — the README says so plainly. Do not vendor GPL/AGPL dependencies.
- **Standard content licence: CC BY 4.0** (already set in the standard repo),
  carried in `standard/<id>/<version>/meta.yaml` and printed on exports and public
  pages. **Never copy code from the standard repo** — it is AGPL-3.0 and
  incompatible with this licence; Compass consumes its generated *data*, not its
  source (`10-legal-and-operations.md` §1.2a).
- **Hosting in Germany**, backups in the EU, a published sub-processor list.
- **The AI region is a real constraint, not a footnote.** German hosting with a
  US inference endpoint is a third-country transfer. Prefer an EU-region endpoint
  (Vertex `europe-west*` or an EU provider); if not, name the region on the screen
  where a steward enables AI. The provider interface in §4 makes this a config
  choice, which is exactly why it exists.
- **Product name: RCOS Compass.** Repo `rcos-compass`, package `rcos-compass`,
  `<title>`, and every member-facing string.

## 13. Decisions this document makes

| # | Decision | Alternative rejected |
|---|---|---|
| A1 | SvelteKit server load + form actions as the API; no separate API layer for MVP | tRPC / REST-first — would double the surface for one client |
| A2 | All logic in services, routes are thin | Logic in `+page.server.ts` — blocks Tauri, jobs, and testability |
| A3 | UUIDv7 text IDs, epoch-ms timestamps | Integer autoincrement — blocks Postgres and leaks counts |
| A4 | AI behind a provider interface, `null` provider in CI | Direct SDK calls — locks us to one vendor and breaks offline tests |
| A5 | Tenant from URL, never from session | Session-held active tenant — the classic cross-tenant leak |
| A6 | SMTP/Resend added to the stack | No email — invites and review nags are unshippable without it |
| A7 | SQLite-backed job table + in-process worker; **MVP is single-instance** | An external queue — unjustified for a pilot, and it would break the self-host story |
| A8 | `adapter-node` on a VPS with a volume; path-based tenancy | Serverless — would force Postgres on day one and break the worker |
| A9 | AI off by default per community, provider terms shown on the enabling screen | AI on by default — sends governance drafts to a third party before anyone chose to |
| A10 | First-party funnel counters, no third-party analytics | Plausible/PostHog — more than we need; or nothing — ships onboarding blind |
| A11 | PolyForm Noncommercial for the app; the standard stays CC BY 4.0 in its own repo; consume its data, never its AGPL code | One licence for both — would either restrict the standard or give away the app |
| A12 | Mobile is a supported surface for every screen, not a read-only subset | Desktop-only working screens — would re-create the access asymmetry RCOS exists to remove |

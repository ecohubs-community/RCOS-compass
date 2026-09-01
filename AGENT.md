# AGENT.md — RCOS Compass

A tool that turns the 213 numbered clauses of the RCOS governance standard into a
short ordered list of things *this* community still has to decide, and keeps what
they decided findable and attributable. Multi-tenant web app. Implementation has
not started.

**It never decides for them.** That is the product, not a slogan — several rules
below exist only to enforce it.

## Read before writing code

| | |
|---|---|
| `UI Spec — v0.1 (draft).md` | the product spec |
| `RCOS Core Specification — v0.1.md` | the standard being implemented |
| `docs/00-architecture.md` | stack, project shape, tenancy, AI, config |
| `docs/01-server-client-contract.md` | how server and client talk |
| `docs/02-component-guidelines.md` | when to make a component; Tailwind-only rule |
| `docs/03-data-model.md` | schema, state machines, readiness/compliance arithmetic |
| `docs/04-security.md` | permission matrix, isolation, untrusted input |
| `docs/09-standards-versions-modules.md` | core vs modules, version pinning, migration |
| `docs/11-definition-linter.md` | the linter's rule set, with messages and fixtures |
| `docs/10-legal-and-operations.md` | licence, hosting, data residency, plans |
| `docs/05-admin-console.md` · `docs/06-testing-strategy.md` · `docs/08-roadmap-mvp.md` | |
| `design_files/platform/` | visual source of truth (dark theme, Linear-dense) |

## Stack

OpenSpec · SvelteKit 2 · Svelte 5 runes · Tailwind 4 (`@theme`, no config file) ·
Bits UI · better-auth · Drizzle + SQLite (Postgres post-MVP) · Valibot ·
Vitest + Playwright · Node 24 / pnpm. AI behind a provider interface, Google AI
Studio adapter. Tauri post-MVP.

## Workflow

Non-trivial changes start as an OpenSpec proposal under `openspec/changes/`, not
as code.

```bash
openspec new change "<kebab-name>"     # scaffold
openspec status --change "<name>"      # what artifacts are still needed
openspec validate <name>               # requirements need normative text (MUST/SHALL)
                                       # in their first paragraph, plus a scenario each
openspec list                          # open changes and task progress
openspec archive <name>                # on ship: folds deltas into openspec/specs/
```

**`docs/` and `openspec/specs/` do different jobs.** `docs/` is the reasoning —
why the model is shaped this way, what was considered and rejected, the eight
review passes. `openspec/specs/` is behaviour a test can pin down. A proposal
cites the docs; it does not restate them. When the two disagree, the spec wins for
behaviour and the doc gets corrected.

Current change: `scaffold-project` (P0). Nothing is implemented yet.

```bash
pnpm dev          # dev server
pnpm check        # svelte-check + tsc — run before every commit
pnpm test         # unit + integration (Vitest)
pnpm test:e2e     # Playwright
pnpm db:generate  # drizzle-kit migration from schema changes
```

## The one process rule

**Nothing ships untested.** Every change that alters behaviour brings its tests in
the same commit — a new service function brings happy path + authorisation denied
+ invalid input; a new capability brings a permission-matrix row; a bug fix starts
with a failing test; a new AI task brings a fixture and an injection case. Tests
that mock the thing under test, snapshot markup, or restate the implementation do
not count. `docs/06-testing-strategy.md` §1 has the full bar, §2 the seven
environments — and no test ever reaches a live AI provider, mail server, or git
remote.

Determinism is part of it: services take `ctx.now()` (never `Date.now()`), UUIDs
are seeded in tests, CI runs `TZ=UTC` with `AI_PROVIDER=null`.

## The rules that are not negotiable

**Architecture**
- All business logic in `src/lib/server/services/*`. Route files parse input,
  call a service, shape a response. Nothing else.
- Reads are server `load`; writes are form actions. A `+server.ts` endpoint is
  only for the seven cases listed in `01` §2.
- `$lib/server/*` is never imported from a `.svelte` file.
- IDs are UUIDv7 strings, timestamps are epoch-ms integers, no raw SQL outside
  `src/lib/server/db` — this is what keeps Postgres a config change.

**Roles**
- **Two: `steward` and `member`.** `owner` is a flag on one membership, for
  transfer and deletion only. `observer` is post-MVP.
- Members propose; stewards record. Members re-order the Path privately and
  upload documents; stewards publish the order, freeze decisions, and destroy
  things. Full matrix in `docs/04-security.md` §1.

**Tenancy & security**
- The tenant comes from the URL (`/c/[slug]/…`), never from the session or a
  form field. Every service filters on `ctx.communityId`.
- Every server load and action calls `requirePermission`. Permissions live in one
  matrix; components never check roles — pass `canFreeze` as a prop.
- Cross-tenant access returns 404, not 403.
- App role (`owner`/`steward`/`member`/`observer`) is access control. RCOS
  membership state (`applicant`/`trial`/`full`/`exited`) is *content* and must
  never authorise anything.
- Platform admin is `ADMIN_EMAILS` + verified email + TOTP, checked per request,
  and **cannot read community content**.

**The AI line**
- AI drafts, structures, questions and maps. It never adopts. There is no code
  path from a model response to an adopted definition, a confirmed mapping, or a
  decision — only to a suggestion row a human confirms.
- Uploaded document text is untrusted data, never instructions. Every AI task
  uses structured output validated with Valibot. Never `{@html}` on anything that
  originated outside the app.
- Every feature must work with `AI_PROVIDER=null`. CI runs that way.
- AI calls are server-side only, logged, and capped by a per-community token budget.

**Governance integrity**
- **"Adopted" has one meaning:** a named person froze one specific version
  through a recorded decision (mechanism, threshold, present, tally, date,
  rationale, review date). A closed consent round with full consent adopts
  nothing until someone freezes it. Nothing else adopts — not a draft, not
  agreement in a thread, not confirmed evidence, not an AI suggestion, not time.
- Freeze is one transaction: decision + version + coverage rebuild + change-log
  entry, or nothing. It is idempotent, and decision refs (`DEC-2026-014`) are
  gapless per community and year.
- The decision register and change log are append-only. Corrections are new
  entries. Erasure tombstones the person, never the record.
- Readiness counts only `MUST` clauses. Provisional definitions count toward
  readiness and **block** compliance. Compliance is binary.
- **No percentage on any public page, ever.** Outward the claim is "compliant" or
  "not yet compliant, these artifacts are missing".
- Publishing shows roles and counts, not member names, unless each attendee consented.

**Runtime shape**
- Background work goes through the SQLite `job` table and the in-process worker;
  every handler must be idempotent. **The MVP is single-instance** — that is why
  migrations run at boot and rate limiting lives in-process.
- AI is **off by default** on a new community; enabling it is an explicit act.
- **Rate limits are per user first**, community budget second — one member must
  not be able to drain the community's AI budget. Hitting a limit degrades to the
  manual path with a plain message, never a failure mid-task.

**UI**
- Every non-obvious term carries a `?` (`<HelpTip id>`), with all copy in one
  translated registry — never inline prose, never hover-only.
- **Every screen works on a phone, down to 375px** — reading, drafting, linting,
  discussing, responding to a consent round, freezing, mapping. Not a read-only
  subset. The three-column definition view becomes **tabs, not a stack**; tables
  become cards; drag becomes explicit move controls; modals become sheets.
- No hover-only affordances. Touch targets ≥44px.
- Tailwind utilities only. No `<style>` blocks, no inline `style=` except a
  computed value (bar widths, drag transforms), no `@apply` outside `app.css`.
- No hex colours in components — semantic tokens from `@theme` only.
- Status vocabulary is one `<StatusChip>` driven by one map. `Provisional` and
  `AI-drafted` are modifiers, not statuses.
- Bits UI owns focus, ARIA and portalling. Don't hand-roll a dialog.
- Every interactive element keyboard-operable, contrast ≥4.5:1, colour never the
  only signal.

## Where the standard content comes from

The RCOS standard and its 22 templates are markdown in the sibling repo
`RCOS-website` (SvelteKit, five locales, CC BY 4.0). That
repo generates YAML; Compass **vendors** it at `standard/rcos-core/0.1/` pinned by
sha256 and never fetches it at runtime. A weekly CI job opens a PR when upstream
changes — it never auto-updates, because a published version is immutable.

**Never copy code from that repo.** It is AGPL-3.0; Compass is PolyForm
Noncommercial. Consume the generated data, not the source.

## Traps specific to this codebase

- **Clause IDs are a triple**, never a bare number: `(standard_id, version, ref)`
  → `core@0.1 · 3.3.2`, `permaculture@0.1 · 1.1.1`. Modules number from 1.1.1 too,
  and the same ref can move between versions. Canonical `ref` is the *document
  section number*; foreign keys use the stable slug key; `<ClauseRef>` is the only
  thing that formats a reference. The current mockups use a layer-relative scheme
  (`1.2.5`) — wrong, being regenerated.
- **A community is pinned to a standard version** via `community_standard`, and
  moves only through a guided migration that is itself a decision. Historical
  decisions keep the ref they quoted — a migration never rewrites history.
- **Definitions have a `scope`.** `standard` answers an RCOS section; `local` is
  the community's own rule (quiet hours, guests, pets). Local definitions get the
  full lifecycle — versions, discussions, consent rounds, freeze, decisions,
  linter, export — and **move no number in either direction**: not readiness, not
  compliance, not an artifact's completeness bar. They render in a separated
  "Local additions" block and are **always** exported carrying *"community
  addition — not required by RCOS-Core v0.1"*. Omitting them misrepresents the
  community; shipping them unlabelled misrepresents the standard.
- **Clauses have a `disposition`.** Only `defined_by_section` clauses count
  toward readiness. `satisfied_by_platform` (the app's own versioning and
  accessibility answer it) and `not_a_definition` (rules about the standard) are
  shown but never counted — there are 12 such MUST clauses in core 0.1, and
  counting them would make 100% unreachable.
- **Never hard-code a clause count.** 213 clauses, 185 MUST, 173 answerable, 118
  sections — all computed by the content pipeline at build time.
- **Modules are separate standards.** Readiness and compliance run once *per*
  adopted standard; module progress is never added to the core number
  (RCOS §10.1.5). Modules are post-MVP as a feature, but the identifiers,
  `community_standard`, and the per-standard loop ship in the MVP.
- **Definition status is derived**, never stored (`03` §5). Storing it guarantees
  the contradictory states already visible in the mockups.
- **One owning definition per clause**, unique-constrained. Cross-references
  contribute nothing to readiness.
- Confirmed evidence goes **stale** when its document is replaced — it is never
  silently re-pointed.
- The git mirror runs *after* a freeze commits, as a job. It must never block or
  roll back a decision.
- **Unresolved objections are never hidden.** A decision frozen over an open
  objection says so permanently, in the register and on its permalink.
- The standard is materialised into read-only DB tables at boot; published
  versions are immutable, and an upsert that would change an active clause's text
  fails the boot.

## Project facts

- **Name:** RCOS Compass. **Licence:** PolyForm Noncommercial 1.0.0 — self-hosting
  by communities is allowed, commercial hosting is not, and it is *not* an OSI
  open-source licence. **The RCOS standard is licensed separately and more openly
  (CC BY 4.0)** and lives in `RCOS-website`. That repo's own
  code is **AGPL-3.0** — consume its generated data, never copy its source, or
  Compass inherits AGPL.
- **Hosting:** Germany. EcoHubs is not a legal entity yet, so no DPA can be signed
  — pilot terms only, and never onboard a community you do not personally know
  until that changes.
- **Plans:** unlimited during the testing phase. No quota or upgrade copy anywhere
  in the product. The AI token budget is the one limit that stays on.
- **Never show data the app cannot actually produce** — in a mockup, a demo, or a
  screen. A fabricated number in a design becomes a fabricated number in
  production, in a product whose entire value is that its claims are checkable.

## Not in this product

Conflict case management, treasury/accounting, member directory, any auto-adopt
button, a self-issued compliance badge. Each was excluded deliberately — see
UI spec §9 before proposing one.

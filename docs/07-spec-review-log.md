---
status: review record
version: 0.1
date: 2026-08-31
reviewed: UI Spec — v0.1 (draft).md (content v0.2); RCOS Core Specification — v0.1.md;
  design_files/platform/*
---

# Spec Review — two passes

Two passes over the existing spec and mockups. **Pass 1** looks for gaps in the
product and model — things that would stop a developer from starting.
**Pass 2** looks for second-order problems — things that would look fine until
the second community, the second freeze, or the first hostile input.

Severity: **B** blocking (decide before schema/code) · **H** high (MVP must
address) · **M** medium (MVP should) · **L** low (post-MVP or note).

---

## Pass 1 — product & model

| # | Sev | Finding | Resolution | Landed in |
|---|---|---|---|---|
| 1 | B | **Two clause-numbering schemes.** The standard numbers by document section (`3.3.2` = Layer 1 probation); the mockups number by layer (`1.2.5`). Both are shown to users and quoted in decision records. | Canonical `clause.ref` = document section number; `layer` displayed as a label; stable `clause.key` slug for foreign keys so RCOS v0.2 renumbering doesn't orphan records. Mockups to be regenerated. | 03 §1 |
| 2 | B | **Definition↔clause cardinality undecided** (the spec's own open question §10.5). Blocks the schema. | One owning definition per clause (unique constraint) + non-owning `references`. Every MUST clause assigned to exactly one section; CI fails on unassigned/double-assigned. | 03 §4 |
| 3 | B | **Readiness and compliance are never defined computationally.** "41%" and "compliant" are the product's two headline claims with no arithmetic behind them. | Exact formulas: readiness = satisfied MUST clauses / MUST clauses, per layer and overall; SHOULD/MAY excluded; compliance = all mandatory artifacts complete ∧ no provisional MUST-satisfying definition ∧ no uncovered clause. | 03 §7 |
| 4 | H | **No roles/permissions matrix.** Roles are named in §2 and never given powers. | Full capability×role matrix, single `permissions.ts`, table-driven test. App role separated from RCOS membership state, which must never authorise. | 04 §1 |
| 5 | H | **No admin/operator surface at all** — no way to create a tenant. | Platform admin console specified, with a metadata-only privilege boundary. | 05 (new) |
| 6 | H | **Provisional mode's integrity hole is named but not closed.** | Interim rule is a real record with a decision; provisional counts for readiness, blocks compliance; ratification creates new decisions rather than mutating history. | 03 §8 |
| 7 | H | **§10.3.4's automatic withdrawal of a compliance claim is unimplementable as written** — nothing defines what un-satisfies a clause. | Review-overdue keeps a clause satisfied but is shown publicly; compliance recomputed on every adopt/lapse; flipping to false withdraws the claim and logs why. | 03 §7 |
| 8 | H | **Visibility model has no enforcement story.** Three levels are defined; nothing says how restricted content stays out of search, exports, AI context, or the git mirror. | One `visibleTo(ctx)` filter used by every read path, including the index, exports and mirror; nightly expiry job for transparency exceptions. | 03 §9, 04 §4 |
| 9 | H | **No email in the stack**, yet invites and review-date nags are in scope. | SMTP/Resend behind one interface; email contains links, never content. | 00 §1 |
| 10 | H | **Document upload has no security envelope** — no size/type/timeout/quota, and the parse feeds an LLM. | Allowlist + sniffing + caps + worker timeout + per-tenant quota; no URL-fetch import in MVP. | 04 §5 |
| 11 | H | **Nothing prevents AI output from becoming state.** §1.3 states the principle as a UI convention. | Structural: an AI response can only create a suggestion row; no code path from model output to adopted definition, confirmed mapping, or decision. Enforced by a test with an injection fixture. | 04 §5, 06 §4.6 |
| 12 | M | **i18n mentioned once, never specified**, for a product whose first two communities are in Ecuador and online/German-speaking. | UI messages via Paraglide; community `locale`; definitions in the community's own language; standard content translatable per version; MVP ships en/de/es UI with en standard content. | 08 roadmap P6 |
| 13 | M | **Offline decisions can involve people who have no account** ("11 present"). | `decision_attendee` allows `external_name` alongside `membership_id`. | 03 §3 |
| 14 | M | **No timezone anywhere**, yet decision refs are year-stamped and "stalled 12 days" is user-visible. | `community.timezone` required; store UTC epoch-ms, render in tenant tz. | 00 §5, 03 §6 |
| 15 | M | **No audit log** distinct from the community change log. | Platform-wide append-only `audit_event`. | 03 §3, 05 §3.4 |
| 16 | M | **Standard versioning is post-MVP but the schema must carry it from day one**, or migration becomes impossible. | `standard_version` on community and definition; clause keys stable across versions. | 03 §2–3 |
| 17 | M | **Search is required by the reverse-lookup feature and never specified.** | FTS5 behind a `SearchIndex` interface, visibility- and tenant-filtered; reverse lookup grounds AI answers in FTS hits with citations. | 00 §5, 03 §11 |
| 18 | L | Missing input: `Writing Good Definitions — Enforceable, Interpretive, Expressive.md` is referenced by the spec but not in the repo; the linter rules depend on it. | *(closed in Pass 6, #76)* — not copied in; its rule set is implemented as `11-definition-linter.md`. | 11 |
| 19 | L | Standard content licensing/attribution in exports is unstated. | Add a licence line to `standard/` and to every export. | 08 P7 |

---

## Pass 2 — second-order, implementation, security

| # | Sev | Finding | Resolution | Landed in |
|---|---|---|---|---|
| 20 | B | **Definition status is treated as stored state, and the mockups already contradict themselves** — a definition shown simultaneously *In discussion*, *Provisional*, with an adopted v2 and a draft v3. | Status is **derived** from (adopted version, open proposal, open discussion, review date) by an ordered rule set. `Provisional` and `AI-drafted` are modifiers, not statuses. The decision-register table must split its Status column from the provisional flag. | 03 §5 |
| 21 | H | **Concurrent freeze produces duplicate decisions and burns reference numbers.** | Gapless per-tenant sequence allocated inside the freeze transaction; idempotency key on the freeze action; duplicate submit returns the existing decision. | 03 §6, 01 §1 |
| 22 | H | **Publishing an artifact publishes personal data** — attendee names and tallies appear on outward-facing pages. | `publish_names_policy` defaults to roles-and-counts; individual names require per-attendee consent. | 03 §9, 04 §4 |
| 23 | H | **Append-only register vs right to erasure.** Both are real obligations and they collide. | Decisions reference `membership_id`, never a denormalised name; erasure tombstones the profile and renders `Former member (M-0142)`; the governance record survives; corrections are new entries. Must be stated verbatim in the privacy policy. | 03 §10 |
| 24 | H | **Cross-tenant leakage has no systematic defence** beyond intent. | Tenant from URL only; every service takes `ctx.communityId`; parameterised cross-tenant test over the service registry so new services are covered by default; 404 not 403 across tenants. | 00 §3, 04 §2, 06 §4.1 |
| 25 | H | **Sessions outlive membership changes.** A removed member or downgraded role keeps their access until re-login. | Membership and role revalidated per request. | 04 §3 |
| 26 | H | **Admin-by-env has no second factor and no privilege boundary** — as specified, it would be the weakest link with the widest reach. | Verified-email match at request time, TOTP required, metadata-only access, triple guard, full audit, no impersonation in MVP. | 04 §6, 05 |
| 27 | M | **Evidence goes silently wrong when a document is replaced** ("Replace with a newer file" is in the mockup). | Passages carry `text_hash`; confirmed evidence becomes `stale` on mismatch and stops counting toward "language for N of 187". | 03 §5 |
| 28 | M | **The linter mockup shows cross-community statistics** ("three of eleven communities read this as monthly") — that is the opt-in cross-community library, which the spec puts post-MVP. | Remove from the MVP linter; keep the vagueness flag without the statistic. | 07 (this row), UI spec §6.2 note |
| 29 | M | **The AI-drafted badge's lifecycle is underspecified** — what happens when a human edits an AI draft? | `ai_assisted` provenance is permanent on the version record; the *badge* clears at human freeze. Provenance is audit data, the badge is a UI state. | 03 §3 |
| 30 | M | **The git mirror can block or corrupt a freeze** if it runs inline, and can leak restricted content. | Post-commit background job with retry; excluded restricted content; failures surfaced in settings, never blocking. | 00 §6 |
| 31 | M | **No rate limiting, no request caps** on a product with file upload and paid AI calls. | Per-user and per-IP sliding windows, per-community AI token budget with a hard stop and visible usage. | 01 §5, 00 §4 |
| 32 | M | **Accessibility risk baked into the design tokens**: muted `#6B7574` on `#0E1011` is ~4.1:1, used at 11px in the sidebar and table footers — below AA. Dark-only with no theme escape hatch compounds it. | Lift muted or raise those sizes; every colour a token so a high-contrast theme is a token file; axe pass on every route. | 02 §6 |
| 33 | M | **No unpublish semantics.** A world-public artifact that is later restricted leaves a live URL. | Unpublish is a decision, returns 410, and the fact of publication stays in the change log. | 03 §9 |
| 34 | M | **Postgres portability would be lost by default choices** (autoincrement ids, SQLite date functions, ad-hoc FTS). | Explicit portability rules: UUIDv7 text ids, epoch-ms integers, raw SQL only behind interfaces. | 00 §5 |
| 35 | M | **Tauri post-MVP is incompatible with logic living in route files.** | All logic in services; routes are thin. Any future transport reuses the same services. | 00 §2 |
| 36 | L | **No observability**: no health endpoint, no structured logs, no error tracking — and the operator is one person. | pino with request/tenant ids, `/healthz`, Sentry-compatible reporting with PII scrubbing, `/admin/status`. | 00 §8, 05 §3.5 |
| 37 | L | **No backup/restore story** for a self-hosted SQLite file the community is told to trust. | WAL + nightly snapshot + continuous replication when hosted; quarterly restore drill. | 00 §6 |
| 38 | L | **Two very different first users** (open question §10.3) still unresolved; it changes what the first-run flow optimises for. | Recommendation: optimise v1 for the **import path** (existing community with documents), because the document-mapping unlock is what makes a forming community stay too. Needs Stefan's call. | 08 P4, open |
| 39 | L | Free-tier boundary (open question §10.2) unresolved; affects the admin console's limits fields only. | Limits are per-tenant fields now; pricing can be decided later without schema change. | 05 §3.3 |

---

## Pass 3 — follow-up after the first review round

Raised by Stefan on 2026-08-31, in response to Pass 1–2.

| # | Sev | Finding | Resolution | Landed in |
|---|---|---|---|---|
| 40 | B | **Clause refs are version-scoped, and the model only half-said so.** `1.2.3` under core 0.1 may point at different text under core 0.2. A ref is only meaningful inside a version. | A reference is the triple `(standard_id, version, ref)`. Decision records store the ref **as quoted at the time**, plus the stable key; a migration never rewrites history. | 09 §1, 03 §1 |
| 41 | B | **Modules number their clauses from 1.1.1 too.** A bare `1.1.1` will be ambiguous the moment the first module exists — in storage, in search, in a pasted chat message. | `standard_id` is part of every clause identity and every rendered reference. One `<ClauseRef>` component formats them all; nothing else does. | 09 §1 |
| 42 | H | **No model for adopting a module, and none for the compliance consequences.** RCOS §10.1.5 forbids modules counting toward core compliance; nothing enforced that. | Readiness and compliance are computed **per adopted standard**; module figures are never summed into the core claim. Guarded by a public-surface test. | 09 §3, 06 §4.4 |
| 43 | H | **Module variants can conflict.** Permaculture and minimal-permaculture cover the same domain — adopting both would produce two owners for the same ground. | `standard.conflicts_with`; adopting a conflicting variant is refused with an explanation. Module adoption is a decision record (RCOS §9.1.5), never a settings toggle. | 09 §2 |
| 44 | H | **No migration path between standard versions**, and RCOS §11.2 guarantees there will be one. | Migration maps ship *with* the new version, with six change classes; guided migration is a governed flow with preview → review queue → adopting decision → abandon path. Old version stays authoritative throughout. CI fails on an unmapped clause. | 09 §4 |
| 45 | M | **First-run must not force the import path.** Pass 1 #38 framed this as an either/or. It is not: a forming community has no documents, and an existing one may not want to upload them yet. | Both paths are first-class from the same entry screen; neither is a prerequisite. The setup interview is the shared spine. Open question 6 in the product spec is withdrawn. | UI spec §4.10, 08 P0 |
| 46 | M | Community version pinning was implied but not modelled — there was one `standard_version` column on `community`. | `community_standard` join table: one active core row, zero or more module rows, each with its adoption decision and its own status (`active`/`migrating`/`retired`). | 03 §3, 09 §2 |
| 47 | L | The content pipeline assumed one standard in one directory. | `standard/<standard_id>/<version>/`, multi-standard loader from day one, and a P1 exit criterion that a second, fake standard loads with no code change. | 08 P1 |

**Cost of preparing now rather than later:** roughly a day of extra work in P1 —
three extra columns, a directory level, and a loop where there would have been a
single value. Cost of *not* preparing: a data migration across every community's
decision history at the exact moment the standard first moves, which is also the
moment communities are least willing to be told their records are wrong.

---

## Pass 4 — pre-implementation sweep

Last look before code. Bias: things that are cheap to decide now and expensive to
retrofit, and contradictions between the mockups and the written workflow.

| # | Sev | Finding | Resolution | Landed in |
|---|---|---|---|---|
| 48 | H | *(resolved — building them)* **`In vote` exists in the designs but not in the MVP workflow.** The mockups show a consent round with a deadline and a running tally; Path A is discussion → freeze, and voting was assigned to post-MVP VoteCast. One of the two is wrong. | Recommend building a minimal **consent round** (proposal + deadline + one response per member + tally pre-filling the freeze). Few days of work, matches what these communities actually do, keeps the `VotingProvider` seam. Alternative is cutting `In vote` from the designs. **Decided: build.** | UI spec §5.1, 03 §3 |
| 49 | H | **Objections have no semantics.** *Support* / *Object* with no defined consequence, in a product built for consent-based groups. | Objection is an object with a reason and a lifecycle; the app enforces no threshold but records unresolved objections permanently on the decision — *"frozen with 1 unresolved objection"*. | 03 §5, UI spec §5.1 |
| 50 | H | **No responsive spec at all.** Desktop 1440×900 artboards only, for a tool whose members will read proposals on phones. | Three tiers: read-and-respond first-class to 375px, work ≥1024, full ≥1440. The three-column triad collapses to **tabs, not a stack**; dense tables become cards; drag-reorder gets explicit move controls on touch. | 02 §7, UI spec §4 |
| 51 | H | **The standard was "loaded into memory", but tenant tables join to clause keys.** A foreign key into a YAML file is not a foreign key. | Materialised into read-only DB tables at boot by idempotent upsert, cache on top. Published versions are immutable — an upsert that would change an active clause's text fails the boot. | 03 §2 |
| 52 | H | **Background jobs had no runtime.** Extraction, mirror pushes, exports and expiry sweeps were all "a job". | SQLite job table + in-process worker, at-least-once with backoff and a dead-letter state on `/admin/status`; **every handler idempotent**. Consequence stated plainly: **the MVP is single-instance**, and migrations-at-boot is only safe because of that. | 00 §6 |
| 53 | M | **Deployment target was never chosen**, and it silently constrains the database. | `adapter-node` on a VPS with a volume; path-based tenancy `/c/[slug]`; custom domains post-MVP for the public index only. Serverless would force Postgres on day one and break the worker. | 00 §7 |
| 54 | M | **Notifications unspecified** — the review-date engine and stalled-discussion nags had no delivery model. | Event matrix with three channels (in-app / immediate email / weekly digest), per-member digest control, email carries a link and never content. | UI spec §4.11 |
| 55 | M | **Concurrent editing of a draft** would silently last-write-win on governance text. | One live draft per definition, 2s autosave, `edit_token` optimistic concurrency, and a keep-mine / take-theirs / merge choice on conflict. | 01 §1, 03 §3 |
| 56 | M | **Document toolchain unnamed**, including PDF *generation* for the MVP export. | `unpdf`/`pdfjs-dist` for extraction, `mammoth` for docx, self-hosted pdf.js viewer, headless-Chromium print for export PDFs. **No OCR in MVP** — a scanned PDF is detected and said so plainly instead of extracting nothing. | 00 §8 |
| 57 | M | **AI provider data terms.** Some hosted tiers reserve the right to train on submitted prompts; governance drafts are the worst possible thing to hand over by default. | **AI off by default** on a new community; enabling it is an explicit act on a screen naming the provider and its terms; use a no-training tier. | 00 §4 |
| 58 | M | **No analytics decision**, so onboarding would ship blind — while third-party analytics would contradict the product's privacy stance. | First-party funnel counters in our own database, aggregated per community, no per-member behavioural data, readable on `/admin/status`; one env flag to disable. | 00 §12 |
| 59 | L | Uploaded files were outside the backup story. | Backed up with the database; the quarterly drill restores both and re-opens a mapped document. | 00 §9 |
| 60 | L | Browser support and the accessibility target level were unstated, so untestable. | Current + previous evergreen browsers; **WCAG 2.1 AA** as a committed target. | 00 §7, 02 §6 |
| 61 | L | Test environments were implied but never enumerated, and nothing said tests ship with the work. | Seven-environment table with determinism rules and a migration-rehearsal step; **"nothing ships untested"** as the project's one process rule, with a per-change minimum bar. | 06 §1–2 |

---

## Decisions — answered 2026-08-31

| | Decision | Answer | Consequences |
|---|---|---|---|
| 1 | Consent rounds in MVP | **Build them.** VoteCast stays post-MVP. | Path A grows a third step; `consent_round` + `consent_response` in the schema; ~3 days in P3; `VotingProvider` seam kept so VoteCast slots in later |
| 2 | Template content location | **Own it in git**, whatever the source is today. Export once, then the site renders from the repo — or, as a fallback, re-export with a CI check that fails when site and repo diverge. | P1 becomes a script rather than a migration; the standard outlives both the app and the site |
| 3 | App licence | **PolyForm Noncommercial 1.0.0** | Self-hosting by communities allowed, commercial hosting is not; **not** an OSI open-source licence, so say so plainly; add a CLA now if outside contributions are ever wanted; dual licensing stays available |
| 4 | Hosting and legal | **Germany. EcoHubs is not a legal entity yet.** | No DPA can be signed; the operator is personally the processor; pilot terms needed before the first community; form the entity before general availability or any money. **And: German hosting plus a US AI endpoint is still a third-country transfer** — pick an EU inference region or name it honestly |
| 5 | Plans and limits | **Unlimited during the testing phase.** | Limit fields exist and stay null; no plan or quota copy anywhere in the product; the AI token budget stays on, because that one costs money per request |
| 6 | Who authors the clause content | **AI drafts, Stefan reviews**, and **Layers 0–1 first** (~20 sections) rather than all 60–80 up front. | ~5 min review per section; Layers 0–1 unblock the whole core loop and the pilot's first month; the rest lands before P5 |
| 7 | Product name | **RCOS Compass** | Repo `rcos-compass`, package, title, and every member-facing string |

Detail and the documents each answer implies: `10-legal-and-operations.md`.

**Resolved on 2026-09-01 by reading the standard repo:** the spec and templates
are already **CC BY 4.0**, the RCOS-website implementation is **AGPL-3.0**, and
"RCOS" is an EcoHubs trademark. Nothing to decide — but two things to respect:
never copy AGPL code from that repo into this one, and record permission to use
the RCOS name as a product name (`10` §1.2a).

---

## Pass 5 — after reading the standard repo (2026-09-01)

Reading `RCOS-website` replaced several estimates with
measurements, and one of the measurements found a bug in the readiness maths.

| # | Sev | Finding | Resolution | Landed in |
|---|---|---|---|---|
| 62 | **B** | **Readiness could never reach 100%.** The denominator was "all MUST clauses", but 12 MUST clauses in core 0.1 are not answerable by a community at all — *"Layer N artifacts MUST be versioned and accessible"* is satisfied by the app, and *"the following MUST remain optional and out of scope"* is a rule about the standard. A community would grind toward a ceiling it could never touch. | Three clause **dispositions**: `defined_by_section` (counted), `satisfied_by_platform` (shown as *"satisfied by Compass"* with a link to how), `not_a_definition` (shown, excluded). Only the first enters any denominator. | 03 §7, 09 §5.3 |
| 63 | H | **The templates violate the one-owner rule today** — 57 clauses are claimed by two or more sections, from harmless local overlap to genuine cross-artifact contests (3.1.2 is claimed by three different artifacts). | An arbitration pass in P1 producing one `owner` + `references` per clause, with the CI check preventing regression. Now a sized task, not a discovered surprise. | 03 §4, 09 §5.2, 08 P1 |
| 64 | M | **The "187 MUST clauses" figure is wrong and hard-coded.** A direct count of core 0.1 gives 185 MUST clauses across Layers 0–6, and 12 of those are not community-answerable. | Every such number is computed from the loaded standard and printed by the pipeline. A headline figure that drifts from the data is exactly the small dishonesty this product cannot afford. | 03 §7 |
| 65 | M | **The section estimate was low.** The spec assumed 60–80 definition atoms; the templates actually contain **118 sections across 22 files**, ~93 of them clause-bearing, plus 25 with no clause line that each need a disposition. | Estimates corrected; the 25 unmapped sections are an explicit P1 output rather than a silent drop. | 08 P1, 09 §5.2 |
| 66 | M | **Licence direction hazard.** The RCOS-website repo's implementation is **AGPL-3.0** while Compass is PolyForm Noncommercial. Copying a markdown helper, a locale utility or the manifest logic would put Compass under AGPL. | The boundary is stated and is also the right architecture: the YAML generator lives in the standard repo (AGPL), Compass consumes its **output data** (CC BY 4.0). Named the specific tempting shortcuts. | 10 §1.2a |
| 67 | L | **"RCOS Compass" uses the RCOS name as a product name**, which `TRADEMARK.md` says needs permission. Same project, so it is a formality — but an unrecorded one. | Record the permission in one line. A governance-standard project that does not follow its own explicitness rule about its own trademark is an avoidable embarrassment. | 10 §1.2a |
| 68 | L | The content pipeline assumed a possible CMS export. It is markdown in a SvelteKit repo, already in **five locales** (en/de/es/fr/pt-br) with build scripts and manifests. | P1 is a generator script beside the existing ones, publishing YAML next to the md/docx/odt downloads — which also makes RCOS machine-readable for third parties, the §8 argument made concrete. | 09 §5, 08 P1 |

**Net effect on the estimate:** P1 gets easier (extraction is mostly free, and
five locales come along), P1 also gets a new task (57 arbitrations + dispositions),
and one arithmetic bug was caught before a community could ever hit it.

---

## Pass 6 — product questions before P0 (2026-09-01)

Raised by Stefan; several were things the mockups showed without the spec
defining.

| # | Sev | Finding | Resolution | Landed in |
|---|---|---|---|---|
| 69 | H | **Four roles was three more than needed.** `owner`/`steward`/`member`/`observer` for communities of 27 people. | **Two roles: steward and member.** `owner` becomes a *flag* on exactly one membership, used only for transfer and deletion. `observer` deferred — adding a role later is a matrix row; carrying an unused one now is dead weight in every query and every test. | 04 §1 |
| 70 | M | **Path ordering and document upload permissions were unstated.** | Any member re-orders the Path **privately** (the mockup already says "only you can see this order"); only a steward **publishes** the order or edits the weights. Any member uploads and confirms mappings — a confirmed mapping is *Evidence*, not adoption, and gatekeeping it would strangle the one onboarding flow that works; only a steward replaces, removes or marks reference-only, because those invalidate other people's evidence. | 04 §1 |
| 71 | H | **AI budget was per community only** — one enthusiastic member could drain everyone's. | **Per-user limits are primary**, community budget is the backstop: 25 tasks/day and 300k tokens/month per user, 2M/month per community. Counted in tokens *and* tasks, because tasks differ by two orders of magnitude. Hitting a limit degrades to the manual path with a plain message. Steward-adjustable post-MVP; the fields exist now. | 04 §5.3 |
| 72 | M | **Upload limits and accepted types were hand-waved.** | Concrete table: `.pdf .docx .odt .md .txt`, extension **and** sniffed content must agree, 25 MB, 200 MB unzipped, 300 pages, 120 s worker timeout, 10/hour and 40/day per user, 60/day and 2 GB per community. `.odt` included because the RCOS templates are published in it. Scanned PDFs accepted but reported, never silently empty. | 04 §5.1 |
| 73 | M | **"Run self-audit" appeared in the mockups with no definition**, while the public index footer cites a self-audit date. | It is a **recorded act**, not a recompute: a steward runs the §10.1 checklist and it writes an immutable, dated `self_audit` snapshot — missing artifacts, uncovered clauses, provisionals, stale reviews, unresolved objections, exceptions. It changes no state, and it is not an approval. | UI spec §4.8, 03 §3 |
| 74 | M | **"Definitions" vs "Decisions" is not obvious**, even to the person who wrote the spec — a reliable sign it will confuse members. | The words are right; the **grouping** was wrong. Three nouns stated explicitly (Definition = the rule; Proposal = a suggested change; Decision = the receipt), nav regrouped into *Working on* / *What we've agreed* / *Reference*, one-line subtitles on index pages, and `?` help everywhere. **Renaming Definitions → Proposals is rejected** — Proposal is already a distinct object and merging them would make the freeze flow incoherent. | UI spec §4.0 |
| 75 | M | **No systematic way to explain the product's vocabulary inside the product.** | One `<HelpTip id>` component, all copy in a single translated registry, click/tap-operable rather than hover-only, with a required-coverage list (linter and its checks, the three types, readiness vs compliance, provisional, evidence, transparency exception, effort tags, ordering weights, self-audit, MUST/SHOULD/MAY, every status). | 02 §5a |
| 76 | L | **The missing linter guide** was blocking P4 and lives in Notion + a vault copy. | Not copied in. Written as `11-definition-linter.md` — the *implementable rule set* derived from it, with rule ids, severities, messages and test fixtures, citing both sources. The prose stays in one place; the rules live where they can be tested. | 11 (new) |
| 77 | L | **Community governance websites** — a real request, and the public index is version one of it. | Captured as the top post-MVP item with a four-step path (our domain → subdomain → custom domain → theming), and the three things that keep it cheap, all already true: separate public route group, host-based resolution stays additive, no hex colours in components. Explicitly not built now. | UI spec §7.1, 00 §7 |
| 78 | L | Future ideas were scattered across conversations. | A captured-not-ranked list: AI presentation generator, AI infographic generator, Ask AI sessions. All three constrained the same way — adopted content only, citations required, output is a draft a human publishes. | UI spec §7.2 |
| 79 | M | **"Ask AI" with sessions** — should it be in the MVP? | **No, post-MVP** — freeform Q&A is the highest-risk AI surface in a governance tool, and the grounded half (reverse lookup, with citations) already ships in the MVP. Two free hooks now: `discussion.origin` so a converted session is attributable, and the visibility rule decided up front (private to its author until converted or shared, then permanently member-visible and stamped AI-assisted). | UI spec §7.3, 03 §3 |

---

## Follow-ups from earlier passes — now closed

1. ~~Say what "adopted" means mechanically.~~ **Done** — UI spec §1.4a: a
   definition is adopted when a named person has frozen one specific version
   through a recorded decision. A closed consent round with full consent is
   still not adoption until someone freezes it, deliberately.
2. ~~Cut the cross-community statistic from the linter mockup.~~ **Done** — the
   flag stays, the claim goes, and the general rule is stated: a mockup must not
   show data the app cannot produce at that stage, because mockups become the spec.
3. ~~Decide #38 — import-first or blank-slate-first.~~ **Withdrawn in Pass 3:**
   both paths are first-class and neither is required (#45).
4. ~~Responsive scope.~~ **Widened on request:** the whole app works on a phone,
   not only a read-and-respond subset (#50, revised).

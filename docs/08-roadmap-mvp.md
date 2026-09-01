---
status: draft for discussion
version: 0.1
date: 2026-08-31
---

# Roadmap to MVP

From an empty repository to the loop in UI spec §6: **see the gap → discuss it →
decide it → find it again later**, running for two real communities.

Estimates assume one developer working with AI assistance, in focused weeks.
They are ranges, not commitments. Phases are ordered by dependency; P4 and P6 can
overlap if content authoring is happening in parallel.

Each phase names an **exit criterion** — the thing that must be demonstrably true
before the next phase starts. No phase is "done" because its tickets are closed.

---

## P0 — Decide and scaffold · ~1 week

The schema-blocking decisions are settled (`07-spec-review-log.md` Pass 3):
clause references are the `(standard, version, ref)` triple with document-section
refs; one owning definition per clause; first-run supports both the import path
and the blank-slate path with neither forced. What remains here is execution.

Carry-over from those decisions:

1. Regenerate the mockups' clause numbers to document-section refs.
2. Confirm where the published template content lives (repo or CMS) — it decides
   whether P1 is a script or a migration.

The seven cross-cutting decisions are answered (`07-spec-review-log.md`,
"Decisions — answered"): consent rounds are in the MVP, the standard content gets
owned in git, the app is PolyForm Noncommercial, hosting is in Germany with no
legal entity yet, limits stay unlimited during testing, clause content is
AI-drafted and human-reviewed starting with Layers 0–1, and the product is called
**RCOS Compass**. The standard content question resolved itself on reading the
standard repo: spec and templates are already **CC BY 4.0**, the standard repo's own
implementation is AGPL-3.0, and "RCOS" is an EcoHubs trademark — so consume the
generated data, never the code, and record permission for the product name.

Also in P0: `LICENSE` at the repo root, the README licensing paragraph that says
plainly this is *not* an OSI open-source licence, and a CLA if outside
contributions are ever wanted — much harder to add after people have pushed
commits.

Then:

- `openspec init`; write `openspec/project.md`; convert `docs/03`, `04` and `05`
  into capability specs. From here every change is an OpenSpec proposal.
- SvelteKit 2 + Svelte 5 + Tailwind 4 + Bits UI skeleton; ESLint/Prettier;
  `pnpm check`; CI pipeline green on an empty app.
- **The test harness before the features**: Vitest + Playwright wired, the seven
  environments of `06-testing-strategy.md` §2 configured, injectable clock,
  seeded UUIDs, `fixture` AI provider, memory mail. A project whose one process
  rule is "nothing ships untested" has to make testing the path of least
  resistance on day one.
- The SQLite job table and worker, with one trivial job end to end.
- `src/lib/server/config.ts` with valibot env parsing and `.env.example`.
- Docker image building and running with a mounted SQLite volume.
- The `/dev/components` gallery route with `Button` and `StatusChip` in it, so the
  design system exists before the screens do.

**Exit:** CI green, container runs, `openspec list` shows the seed specs.

---

## P1 — Standard as data · ~1.5 weeks

**The content source is settled**: `RCOS-website` is a
SvelteKit repo with the templates as markdown in five locales. So P1 splits into
work in *that* repo and work here.

**In the standard repo** (AGPL — keep it there, never copy its code into
Compass):

- `scripts/build-standard-data.mjs`, alongside the existing `build-templates.mjs`,
  emitting `clauses/sections/artifacts/glossary` YAML + JSON per standard and
  version, with a `manifest-standard.json` carrying sha256 per file.
- Publish the YAML next to the existing md/docx/odt downloads, CC BY 4.0 line
  embedded. Costs nothing extra and makes RCOS machine-readable for anyone.

**In this repo:**

- Vendor `standard/rcos-core/0.1/` pinned by hash; a weekly CI job opens a PR when
  upstream changes rather than auto-updating.
- **The loader is multi-standard and multi-version from day one** — the directory
  shape, the `(standard_id, version, key)` keys, and the per-standard readiness
  loop. Only core 0.1 exists; the code must not assume that
  (`09-standards-versions-modules.md` §5).
- `standard/migrations/` with the migration-map schema, empty but CI-validated,
  so authoring core 0.2 has a target.
- **The one-owner arbitration pass**: 57 clauses are currently claimed by more
  than one section. Each needs one `owner` and the rest as `references`. Sized,
  not guessed — and the CI check keeps it from regressing.
- **Clause dispositions**: mark the 12 MUST clauses that no community answers as
  `satisfied_by_platform` or `not_a_definition`, and resolve the 25 sections that
  carry no clause line. Without this, readiness can never reach 100%.
- **Content authoring loop**: a script drafts, for **every** section, the
  plain-language dashboard question, the effort tag and the `depends_on` edges via
  the AI provider, writing YAML for review. Stefan reviews all of them — about 5
  minutes each across ~93 clause-bearing sections, plus half a day on the
  dependency graph as a whole.
- **Review Layers 0 and 1 first** (~20 sections). AI drafts everything up front
  because that is cheap; the *review* is phased, and Layers 0–1 are enough to
  unblock P3, the e2e spec, and a pilot community's first month. Layers 2–6 are
  reviewed before P5.
- **The invariant check**: every MUST clause owned by exactly one section, run in
  CI as the first job.
- `<ClauseRef>` as the single reference formatter, already scope- and
  version-aware.

**Exit:** 213 clauses, 22 template artifacts and ~118 sections load and validate
in all five locales; every MUST clause has exactly one owner or an explicit
non-`defined_by_section` disposition; a script prints readiness for a synthetic
community; a second, fake standard id loads alongside core without a code change.

---

## P2 — Auth, tenancy, permissions · ~1.5 weeks

- Drizzle schema for users, communities, memberships, invitations, audit events.
- better-auth: email+password, magic link, verification, TOTP.
- `hooks.server.ts`: request id, headers/CSP, session, rate limit, tenant
  resolution.
- `permissions.ts` + `requirePermission` + the matrix test.
- Invitations end to end, with email.
- **Platform admin console** (`05-admin-console.md`) — it is needed here, because
  every subsequent phase needs a way to make a tenant.

**Exit:** the security suite in `06-testing-strategy.md` §6.1–6.3 passes;
two communities exist and provably cannot see each other; admin CRUD works and
is audit-logged.

---

## P3 — The core loop · ~3 weeks · *this is the MVP's spine*

- Definitions, versions, discussions, posts, proposals.
- **Freeze**: transactional, idempotent, gapless refs, provisional handling,
  change-log entry. Plus *Take offline* as a first-class path (UI spec §5.1).
- Readiness and compliance services with the full unit suite.
- **Local definitions** (UI spec §1.4b): scope on the definition, the partial
  unique index, a default *Community Agreements* artifact per community, the
  "Local additions" block under RCOS artifacts, and the `standard_feedback`
  checkbox. Same lifecycle as everything else — the work is mostly making sure
  they touch no number.
- Objections with a lifecycle, and **consent rounds** — open a round with a
  deadline, one response per member (consent / objection / abstain), tally
  pre-filling the freeze — behind a `VotingProvider` interface so VoteCast slots
  in post-MVP as a second provider.
- Draft autosave with `edit_token` concurrency handling.
- Notification events, in-app plus the weekly digest job.
- Screens: Dashboard, Standard browser, Definition detail (the three-column hero,
  tabs below 1024px), Discussions, Discussion thread + Freeze modal, Decision
  register.
- Interim adoption rule + provisional badges + ratification sweep.

**Exit:** the e2e loop spec in `06-testing-strategy.md` §7 passes end to end on a
fresh community, and readiness moves by the right amount.

---

## P4 — Documents, evidence, and the one AI feature · ~2.5 weeks

- Upload with the full security envelope; PDF/docx extraction in a worker
  (`unpdf`/`mammoth`); scanned-PDF detection with a plain message rather than a
  silent zero-passage result.
- Passages, viewer with highlights, manual passage→clause mapping (**ship this
  first — it is the fallback that makes the AI optional**).
- AI provider interface + Google AI Studio adapter + `null` and `fixture`
  providers; token budgets; `ai_call` logging.
- AI mapping suggestions → confirm/dismiss → "turn into definition".
- **The definition linter** — rule-based half first, AI-assist rules second;
  the full rule set with messages and fixtures is `11-definition-linter.md`. Cut the
  cross-community statistic from the mockup (#28).
- Injection fixture test (`06` §6.7) before the AI path ships.

**Exit:** upload bylaws → confirmed evidence → a definition pre-filled with the
community's own words; the whole flow works with `AI_PROVIDER=null`.

---

## P5 — The Path, glossary, search · ~1.5 weeks

- Ordering service with visible, editable, versioned weights; drag override;
  "why this is here" derived from the same inputs as the rank.
- Risk-profile setup interview.
- FTS5 index behind `SearchIndex`; global search; **reverse lookup** with
  citations to clauses and decision refs.
- Glossary page + slide-over panel, auto-populated from adopted definitions.

**Exit:** a day-one community completes the setup interview and gets a defensible
ordered list; reverse lookup answers the water-pump question from the mockup.

---

## P6 — Publishing, export, i18n · ~2 weeks

- Visibility enforcement across every read path; transparency exceptions with
  expiry; unpublish → 410.
- Public artifact index (anonymous, binary claim, no percentage, names only by
  consent) + the public-surface test.
- Export: Markdown + PDF + JSON bundle as a background job with signed links,
  **including local definitions, each labelled as a community addition**.
- Git mirror as a post-freeze job.
- i18n: Paraglide for the UI. **Standard content ships in all five locales the
  RCOS-website repo already maintains** (en/de/es/fr/pt-br) — it is generated, so it is
  free. UI translation starts with en/de/es and grows to match; a community picks
  its locale, and definitions are written in the community's own language
  regardless.

**Exit:** the public index test passes; a community exports itself and the bundle
opens without the app.

---

## P7 — Hardening and pilot · ~2 weeks

- Full a11y pass (including the muted-contrast fix, #32); keyboard-only run;
  **the full core-loop e2e spec run at 375px as well as 1440px** — mobile is a
  supported surface, not a courtesy.
- Pilot terms, privacy policy, sub-processor list (`10-legal-and-operations.md` §6).
- Backup + restore drill; observability; `/admin/status`.
- Privacy policy and ToS, including the erasure-vs-register position (#23) and
  the AI-provider statement.
- Seed the two pilot communities; onboarding sessions; a feedback loop that lands
  in OpenSpec proposals rather than in a chat backlog.

**Exit:** EcoHubs online and Fruit Haven are using it on real material, and the
first week produces bug reports rather than confusion.

---

---

## P8 — Modules and standard migration · post-MVP, ~3 weeks

Not MVP scope, but listed here because P1 and P2 must leave the door open (they
do — see `09-standards-versions-modules.md` §5).

- **Module catalogue and adoption flow** — browse available modules, see which
  layers each extends, adopt via a decision record (RCOS §9.1.5), refuse
  conflicting variants (permaculture ⟷ minimal-permaculture). Module readiness
  reported separately and never merged into the core compliance claim (§10.1.5).
- **Module content** for permaculture and minimal-permaculture, once their
  templates exist — the same parse-and-structure work as P1, per module.
- **Standard migration** — the preview screen, the review queue, the
  carry-forward rules, the adopting decision, and the "abandon" path.
- Standard-diff view between two versions.

Trigger for starting P8: either the first module templates being published, or
core 0.2 entering draft. Whichever comes first decides the order of the two
halves.

---

## Totals and shape

~15 focused weeks to a pilot-ready MVP; call it **4–5 months** at a realistic
part-time pace, with P3 and P4 carrying most of the risk.

**The three things most likely to blow the estimate**, in order:

1. **Content work in P1** — smaller than feared now that the templates carry
   their own clause references, rationale and instructions in five locales, but
   the 57 overlapping clauses and the disposition pass are judgement calls, and
   the effort tags and dependency edges still need a human eye on every AI draft.
   Mitigated: only Layers 0–1 gate P3.
2. **The freeze path in P3** — transactions, provisional state, supersession and
   the change log are where correctness bugs hide, and they are the bugs that
   destroy trust in the record.
3. **Document extraction quality in P4** — real bylaws are scanned PDFs with two
   columns. The manual path existing first is what keeps this from being fatal.

**Explicitly not in the MVP** (unchanged from UI spec §6): VoteCast, stress
tests, meeting mode, facilitation guides, cross-community library, info-graphics,
conflict case management, local AI, Tauri, realtime — plus modules and standard
migration, which are P8.

## Why

Every screen in this product renders the standard. Until RCOS exists as
structured data, there is nothing to render, nothing to count, and no way to tell
a community which clause it has not answered.

The measurements that make this urgent (`docs/07-spec-review-log.md` Pass 5):

- The published templates already carry **22 artifacts, 118 sections and 190
  clause references**, with rationale and instructions, in five locales. Most of
  what P1 was budgeted for is extraction, not authoring.
- **57 clauses are claimed by more than one section.** The one-owner rule
  (`docs/03-data-model.md` §4) is violated by the source material today, so
  readiness cannot be computed until each is arbitrated.
- **12 MUST clauses have no template section at all**, because no community
  answers them — *"Layer N artifacts MUST be versioned and accessible"* is
  satisfied by the tool, and *"the following MUST remain optional"* is a rule
  about the standard. Counting them would put a ceiling on readiness that no
  community could ever reach.

What a community loses without this: the product's core claim. "You have
answered 41% of what the standard requires" is only true if something computed
it from the standard itself, and "here is the clause you have not answered" is
the whole reason to open the app.

## What Changes

**In the RCOS-website repository** (AGPL — the generator stays there, and Compass
consumes its output, never its code):

- `scripts/build-standard-data.mjs`, beside the existing `build-templates.mjs`,
  parsing the core specification and the 22 templates into structured YAML in all
  five locales.
- `content/standard-data/rcos-core-0.1/ownership.yaml` — the authored half:
  one owning section per clause, and a disposition for every clause no community
  answers. These are properties of the standard, not of Compass, so anyone
  implementing RCOS gets them.
- Published to `static/downloads/standard/`, licensed CC BY 4.0, with a manifest
  carrying a sha256 per file — which makes RCOS machine-readable for third
  parties, not just for us.

**In this repository:**

- `standard/rcos-core/0.1/` vendored from that output and pinned by hash. No
  build-time or runtime network dependency, so self-hosted instances and offline
  CI work unchanged.
- A multi-standard, multi-version loader that does not assume core 0.1 is the
  only thing it will ever load.
- The **ownership invariant as a CI check**: every MUST clause has exactly one
  owning section or an explicit non-`defined_by_section` disposition. This is the
  single most important check in the content pipeline.
- Compass's own annotations — the plain-language question, effort tag and
  dependency edges the Path needs — for **Layers 0 and 1 first**, which is enough
  to unblock P3.

## Capabilities

### New Capabilities
- `standard-content`: how a standard is represented, loaded, and validated — including the ownership invariant and clause dispositions

### Modified Capabilities
<!-- none: no existing capability changes its requirements -->

## Impact

- Adds `standard/` to this repository and a build script to RCOS-website.
- Nothing renders it yet; P3 builds the screens.
- Relies on: `docs/03-data-model.md` §1–2, §4, §7 ·
  `docs/09-standards-versions-modules.md` §5 · `docs/08-roadmap-mvp.md` P1.
- The 57 arbitrations are judgement calls. They ship as a reviewable report
  (`docs/12-clause-ownership-report.md`) rather than as silent data.

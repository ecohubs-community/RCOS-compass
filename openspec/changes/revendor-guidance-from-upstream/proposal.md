## Why

The Path's plain-language question, its "What to cover" prompts and its example
answers were written for Compass and kept in `annotations.yaml`, in English
only. RCOS-website has since taken them in verbatim, reviewed them and
translated them, and now publishes them with each section of `sections.yaml`,
per locale (`question`, `prompts`, `examples`; RCOS-website's 2026-10-05
generation). Keeping Compass's copy would leave two sources for the same words
that drift on the next upstream review, and a German community would keep
reading English questions above German clause text when a German question
exists.

Before deleting Compass's copy, the English annotations were compared with the
published English values: all 102 annotated sections match exactly — question,
prompts and examples — so nothing a community sees in English changes.

Reasoning: `docs/09-standards-versions-modules.md` §5.4 (vendored, pinned,
re-vendored by hand); `openspec/changes/archive/2026-10-01-path-question-guidance/design.md`
§1, which put guidance in the annotations and named "upstream in the RCOS
templates" as the alternative that waited on RCOS-website.

## What Changes

- **Re-vendor RCOS-Core 0.1** from RCOS-website's `static/downloads/standard/`:
  every file its manifest lists, byte for byte, and the manifest itself as
  `standard/upstream-manifest.json`. New in the manifest: `specSections.yaml`
  (per-spec-section "in short" and FAQ) and `schema.json`; Compass reads
  neither yet, and vendors them so the integrity check covers everything
  upstream published. Structure is unchanged — no clause, section or artifact
  key, ref, owner or disposition moved. The other differences are German
  only — 80 clause texts (mostly normative-keyword grammar, `KANN` → `KÖNNEN`,
  `MUSS` → `MÜSSEN`), one artifact summary and one section's placeholders —
  and `meta.source` now pointing at `/standard/core/0.1`.
- **The loader reads guidance from the section.** `StandardView.guidance(key,
  locale)` returns `{ question, prompts, examples }` in the requested locale,
  each field falling back to the default locale on its own. `questionFor` and
  `guideFor` use it, so the Path, the artifact page, provenance, "What to
  cover" and the mapping workspace's clause picker show the question in the
  community's language. The document-mapping prompt keeps English, as before.
- **`annotations.yaml` keeps only `effort` and `dependsOn`.** The three fields
  are removed from all 102 entries; the header says where they went.
- **`pnpm check:standard`** requires a default-locale question on every
  authored section from the published data instead of from the annotations,
  validates `prompts`/`examples` in every locale, and refuses any annotation
  field other than `effort` and `dependsOn` — a question written back there
  would never be shown.

Version: `0.15.0 → 0.15.1` — a copy change: non-English communities see their
questions, prompts and examples translated; nothing else is visible.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `standard-content`: the question and its guidance come from the vendored
  standard; annotations carry effort and ordering only; the check moves with them.
- `question-guidance`: guidance is shown in the community's language.

## Impact

- Content: everything under `standard/rcos-core/0.1/` and
  `standard/upstream-manifest.json` (vendored); `annotations.yaml` (Compass's).
- `scripts/check-standard.mjs`.
- Loader: `src/lib/server/standard/{types,index}.ts` — `Section.i18n` gains the
  optional guidance fields, `Annotation` loses them, `StandardView.guidance()`.
- Services: `requirement.ts` (`questionFor`, `guideFor`), `mapping.ts`,
  `workspace.ts`.
- Docs: `docs/00-architecture.md` §2, `docs/08-roadmap-mvp.md` P1.
- No schema change, no migration.
- **Not here:** the "Example written for Compass" label stays as it is, though
  the examples are now published by RCOS — whether it should say so is a copy
  decision of its own (`design.md`, open question). `specSections.yaml` is
  vendored and unread.

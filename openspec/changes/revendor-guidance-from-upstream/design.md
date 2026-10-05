## Context

`path-question-guidance` (2026-10-01) put `prompts` and `examples` beside the
question in `annotations.yaml`, English only, and named upstream as the better
home once RCOS-website could take them. It now has: RCOS-website imported the
annotations verbatim, reviewed and translated them, and its 2026-10-05
generation publishes them inside each section's `i18n.<locale>` — for all 94
authored sections and the 8 Ratification Records Compass had also annotated
(102), in all five locales.

## Decisions

### 1. Read guidance from the section, falling back field by field

`StandardView.guidance(sectionKey, locale)` returns
`{ question: string | null, prompts: string[], examples: string[] }`, or
undefined for an unknown section. Each field is taken from the requested locale
when present and non-empty, else from `meta.defaultLocale`.

- *Alternative: `localise(section.i18n, locale)` as for titles* — it falls back
  per entry, and an entry with a translated title but no question yet would
  yield no question at all, so the Path would show the German heading where a
  question belongs. Per field, the member gets the English question instead.
- No `isFallback` flag: no caller of the section title uses one either, and
  upstream publishes all five locales completely today.

### 2. Which callers follow the locale

| Caller | Before | Now |
|---|---|---|
| `questionFor` — Path, artifact page, provenance, "not here" | English annotation | community locale |
| `guideFor` — "What to cover" | English annotation | community locale |
| `workspace.ts` clause picker | English annotation | community locale, like the clause text beside it |
| `mapping.ts` — model prompt | English annotation | English (`'en'`), unchanged: the prompt is English |

### 3. Annotations shrink to planning; the check refuses the rest

`annotations.yaml` keeps `effort` and `dependsOn` for the same 102 keys, values
unchanged (verified). The check refuses any other field: a `question` added
there would be silently ignored by the loader, and silence is how two sources
drift. The per-section "has an annotation" requirement goes — an entry is
optional again, and a section without one gets the Path's default
(`one_meeting`, no edges).

### 4. The check keeps a question requirement

Upstream validates that "a question covers what its section owns", but the
check here is what stops a re-vendor from putting a heading back on the Path,
and it costs nothing: every authored section must have a non-empty question in
the default locale. `prompts`/`examples`, where present, must be lists of
non-empty text in every locale. Both run on hash-pinned data, so a failure
means upstream published it — the fix is upstream, then re-vendor.

### 5. Diff before delete

English annotation vs published English, per section and field: 102 sections,
0 differences in `question`, `prompts` or `examples`; no section has upstream
guidance without a Compass annotation, or the reverse. The upstream review
changed translations, not the English.

## Risks

- **A German question beside an English example label.** The source label
  ("Example written for Compass") is translated by Compass's own messages, so
  it follows the locale; only its truth is in question (below).
- **Tests mutate vendored files** (`sections.yaml`) to prove the check fires,
  then restore them, as the ownership test already did. A crash mid-test
  leaves a modified file; `pnpm check:standard` then fails loudly on the hash.

## Open Questions

- Should "Example written for Compass" become "From the RCOS guidance" now that
  RCOS publishes these examples? The examples were written for Compass, so the
  label is not false; changing it is copy in three message files and the
  `question-guidance` spec, and is left for a decision.
- `specSections.yaml` (per spec-section "in short" plus FAQ, five locales) could
  feed the requirement column or the clause sheet. Not used here.

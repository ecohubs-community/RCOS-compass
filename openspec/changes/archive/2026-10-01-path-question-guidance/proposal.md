## Why

One short question cannot carry everything a section asks a community to decide.
"Who may decide what, where does it stop, for how long — and who may act in an
emergency?" is four decisions in one line, and §4.6.1's question names none of
the four failure modes the clause lists (concentration, informal vetoes, capture
by subgroups, entrenchment). A group reading only the question will answer part
of it, freeze it, and believe the section is done.

Reviewing the questions after `path-items-cite-their-clauses` (2026-09-30)
settled how to fix that: **sub-questions inside one Path item**, not more Path
items. A section stays one item, one discussion and one definition — the unit a
freeze adopts and the artifact is assembled from — so splitting the *prompting*
never splits the *decision* and nothing can be answered twice. And a group
starting from a blank page needs to see what an answer looks like: example
answers, clearly labelled as examples, so none reads as the answer.

Reasoning: `UI Spec — v0.1 (draft).md` §4.1b, §4.3, §5.1; review notes on
`openspec/changes/archive/2026-09-30-path-items-cite-their-clauses/design.md` §4.

## What Changes

- **Annotations gain `prompts` and `examples`** (Compass's own file,
  `standard/rcos-core/0.1/annotations.yaml`). Prompts are the sub-questions a
  proposal should answer; examples are full-sentence answers written for
  Compass. Both optional per section; `pnpm check:standard` rejects empty ones.
- **Template hints are shown too**, from the standard's own placeholders: the
  full-sentence "e.g." lines only (table fragments like "e.g. Finance Steward"
  are left out), labelled "From the RCOS template".
- **A discussion and a definition show "What to cover"**: the prompts, then the
  examples under "Examples — not recommendations", each saying where it came
  from. Collapsed by default in a thread's header so the conversation keeps the
  screen.
- **Content**, from the review:
  - prompts for identity constraints (2.4.1, and its enforcement section),
    voluntary exit (3.6.1/2/4), registered authorities (4.3.1–4.3.5, the
    emergency-authority part as its own prompt), governance safeguards (4.6.1–3,
    each failure mode named), contribution recognition (5.2.2/5.2.5), sanctions
    and repair (6.4.x), conflict classification (6.1.x) and conflict safeguards
    (6.3.x) — each prompt worded so it does not ask what a sibling section owns;
  - examples for voluntary exit and identity constraints;
  - reworded questions: secondary purposes, member rights, participation,
    membership states, admission criteria, registered authorities, contribution
    recognition, identity constraints.

Version: `0.9.0 → 0.10.0` — members see what a question covers and what an
answer can look like.

## Capabilities

### New Capabilities
- `question-guidance`: sub-questions and labelled example answers for a Path
  item, where they come from, and where they are shown.

### Modified Capabilities
- `standard-content`: annotations may carry prompts and examples, validated by
  the content check.

## Impact

- Content: `standard/rcos-core/0.1/annotations.yaml`; `scripts/check-standard.mjs`.
- Loader type `Annotation` (`src/lib/server/standard/types.ts`).
- `src/lib/server/services/requirement.ts` (`guideFor`).
- New `<QuestionGuide>`; discussion and definition pages.
- No schema change, no migration.
- **Not here:** the per-layer artifact checks (2.5.x, 3.8.x, 4.7.2 …) wait for
  2.5.2 and 3.8.2 to become `satisfied_by_platform` upstream, and are their own
  change.

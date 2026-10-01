## Context

`path-items-cite-their-clauses` made each Path item cite its clauses and show the
RCOS requirement. The review of its question audit (2026-09-30) asked for more
than a reworded line: sub-questions ("For each one: who does it apply to? …") and
example answers, and splits for the heaviest sections. Asked how to split, the
answer was **sub-questions inside one item** — a split Path item would need a
"part" concept in the schema, the freeze and the export, and invites the same
thing being decided twice when the parts are assembled into the artifact.

## Decisions

### 1. Guidance lives in the annotations

`annotations.yaml` is Compass's file (not in the upstream manifest), already
carries the question, and is read by the loader. `prompts: string[]` and
`examples: string[]` join it. English only, like the question.

- *Alternative: upstream in the RCOS templates* — better reach, but waits on
  RCOS-website, and examples are Compass's opinion rather than the standard's.

### 2. Template hints are derived, and filtered

The template's `placeholders` (five locales) already contain hints like "e.g.
within 24 hours of confirmation." Shown are the lines that contain "e.g.", end
with a full stop and have no "..." — 79 lines across 26 sections. The template
ends its sentences with a full stop and its table cells without one, and the
cells ("e.g. Finance Steward") read as noise out of their table; word count
could not tell the two apart. Lines are chosen by the English text and shown in
the community's locale: each translation marks examples its own way ("z. B.",
"p. ej.", "por exemplo"), and the placeholder lists are line-for-line
translations (checked: no section's lists differ in length).

### 3. One read, one component

`guideFor(view, sectionKey, locale)` in `requirement.ts` returns
`{ prompts, examples: { text, source: 'compass' | 'template' }[] }` or null when
there is nothing. `<QuestionGuide>` renders it: the prompts as a list, then
examples in a `<details>` headed "Examples — not recommendations", each with its
source. The discussion header wraps it in a closed `<details>` "What to cover";
the definition page shows it under the requirement column. `<details>` is the
no-JavaScript path and needs no dialog.

### 4. Content, and what each prompt must not ask

Every prompt was checked against the section's siblings, so the assembled
artifact never answers one thing twice:

| Section | Not asked here, because |
|---|---|
| contribution recognition | categories (5.2.1) and units (5.2.4) are their own sections; contesting a record is "Dispute Resolution for Economic Records" |
| sanctions and repair | restoring rights is "Conditions for Restoring Rights" |
| conflict classification | who may read records is "Privacy and Information Access Boundaries" |
| conflict safeguards | retaliation is "Anti-Retaliation Protections" |
| identity constraints | how a breach is detected and handled is "Enforcement and Testability" |
| voluntary exit | roles, tasks, access and held assets are "Asset, Role, and Responsibility Separation" |

The identity-constraints wording keeps the reviewer's prompt structure (who it
applies to, what it means, why it is needed) but frames the question around the
community rather than the person: RCOS §2.4 constraints are "identity-level" —
what the community is — and of the four suggested examples only "18+ to join"
is one; residents voting on housing is the Decision Matrix (4.4), founders
having no extra votes is authority (4.3.4), and conflict-of-interest abstention
is the Treasury Ruleset's.

`conditions-for-change` and `completion-record` keep their current questions
until 2.5.2 and 3.8.2 are re-vendored as `satisfied_by_platform`.

## Risks / Trade-offs

- [Examples read as the answer] → always two kinds of label ("not
  recommendations", and the source), and Compass examples are written as one
  community's choice, not a default.
- [Prompts only exist for nine sections] → the rest still have their question,
  the requirement and the template hints; adding prompts is content work that
  needs no code.

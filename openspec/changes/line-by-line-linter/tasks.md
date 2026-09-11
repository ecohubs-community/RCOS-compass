## 1. The result shape

- [ ] 1.1 Add a line anchor to `Finding` in `shared/linter.ts`, optional so a whole-body finding stays expressible
- [ ] 1.2 Define the per-line result shape — lines with text, job, how the job was arrived at, and findings — carrying a version stamp for the shape itself
- [ ] 1.3 Add a reader that recognises the old flat shape by its absent stamp and reports it as unannotatable rather than empty
- [ ] 1.4 Tests: a new result round-trips through JSON; a stored flat result is recognised as old and never renders as a clean annotation

## 2. Segmentation

- [ ] 2.1 Split plain text into blocks — paragraph and list item — before sentences
- [ ] 2.2 Split each block into sentences with `Intl.Segmenter` at the community's locale, treating a list item as its own line even when it is not a full sentence
- [ ] 2.3 Tests: a multi-sentence paragraph splits; a list splits per item; an abbreviation, a decimal and a `§3.6` reference do not split a sentence; an empty body yields no lines; the fixtures use real text from the standard

## 3. Per-line judgement

- [ ] 3.1 Restructure `lint()` to dispatch per line, moving the existing signal regexes across unchanged
- [ ] 3.2 Port the enforceable, interpretive and expressive rules to run against one line
- [ ] 3.3 Infer a line's job only on an unambiguous read; report anything else as unlabelled, and record on the result that the job was inferred rather than stated
- [ ] 3.4 Leave the shape able to carry an author-declared job, without offering anywhere to declare one in this change
- [ ] 3.5 Keep the vagueness and cross-type rules running per line, preserving `docs/11` §6.2's constraint on what the vagueness finding may say
- [ ] 3.6 Run the assisted rules once per body and report their findings with no line anchor
- [ ] 3.7 Tests: a body mixing an enforceable and an expressive line judges each on its own; a finding names its line and no other; an unlabelled line gets no default job; every job on a result reads as inferred; with `AI_PROVIDER=null` every rule-based finding still appears and the assisted checks report as not run

## 4. The ambiguous middle

- [ ] 4.1 Add `line.ambiguous-middle`, firing when a line binds, carries no checkable criterion, and is not marked non-binding
- [ ] 4.2 Give the finding all three remedies — make it enforceable, label it non-binding, delete it — with none preferred and none performed by the linter
- [ ] 4.3 Rewrite `docs/11-definition-linter.md` §2 around the line and replace §7's three-rules-in-concert with this rule
- [ ] 4.4 Tests: "Candidates are expected to show up with humility" fires it; the same line carrying a non-binding marker does not; a binding line carrying a test does not; a purely descriptive line does not; it fires with no provider configured; a version containing one still freezes and stores the finding; the finding carries all three remedies

## 5. Clutter

- [ ] 5.1 Add `line.clutter` at advisory severity, firing when a line binds nobody, frames no trade-off or default, carries no identity language, and adds nothing to an adopted definition
- [ ] 5.2 Reuse the existing `all.duplicate` overlap machinery and its `adoptedElsewhere` input so a duplicating line's finding names what it duplicates
- [ ] 5.3 Suppress it on any line already reported as the ambiguous middle
- [ ] 5.4 Render the clutter finding inline on its line, in the same shape as every other finding, with deleting the line as its one action
- [ ] 5.5 Tests: a line restating an adopted definition fires it and names that definition; connective prose fires it; an identity line does not; an enforceable line does not; a line that is both clutter-shaped and the ambiguous middle reports only the ambiguous middle; a version containing a clutter finding still freezes and stores it; the severity is advisory and never blocker-shaped

## 6. The derived primary job

- [ ] 6.1 Compute the primary job as the strongest job present — enforceable, then interpretive, then expressive — and none where no line carries one
- [ ] 6.2 Ignore any type supplied by a caller and store the derived value on the draft and the version
- [ ] 6.3 Remove the type selector from the definition draft editor and show the derived job read-only
- [ ] 6.4 Update the definitions list and the register to read the derived value
- [ ] 6.5 Tests: all-enforceable yields enforceable; three expressive plus one enforceable yields enforceable, not expressive; interpretive plus expressive yields interpretive; no labelled line yields none; a supplied type is ignored; a version frozen before this change keeps the type it had

## 7. Storing and running

- [ ] 7.1 Add `post.linter_result` and store a result when a proposal is posted
- [ ] 7.2 Stop `freeze` writing `linterResult: null` and `aiAssisted: false` unconditionally at `services/decisions.ts:316` — carry the adopted proposal's stored result and its real AI-assistance flag onto the version, closing a `definitions` requirement the code has never met
- [ ] 7.3 Do the same at the other `definitionVersion` insert, `services/definitions.ts:435`
- [ ] 7.4 Make the version's `type` the primary job derived from that result rather than `draft?.type`
- [ ] 7.5 Remove the `lint()` call from the discussion page's `load` — the only on-read run in the codebase
- [ ] 7.6 Make re-running an explicit, permission-checked act that replaces the stored result and records when it ran
- [ ] 7.7 Tests: a frozen version stores the linter result of the proposal it adopted rather than null; a version adopted from an AI-assisted draft records that it was; posting a proposal stores a result; opening a definition or a discussion runs no lint; a new version carries its own result and the previous version keeps its own; a re-run replaces rather than appends; a member of another community re-running is refused and the stored result is unchanged

## 8. The screens

- [ ] 8.1 Add the `Plain text | Line by line` toggle to the definition detail, per screen 03
- [ ] 8.2 Build the not-yet-run state — prose shown, annotated view unavailable, reason stated, run offered — per screen 03b, and use it for results in the old shape
- [ ] 8.3 Render per-line badges, per-line findings, the ambiguous middle's three remedies and the clutter finding, all inline on their line
- [ ] 8.4 Render the summary line the design shows — lines carrying a test, of how many — and the read-only primary job
- [ ] 8.5 Give the discussion rail's linter card the same per-line rendering and its own not-yet-run state, for proposals written before this change
- [ ] 8.6 Tests: a definition with no result shows prose and offers a run; a definition with an old-shape result does the same rather than showing an empty annotation; the toggle switches without a network round trip; badges and findings are reachable by keyboard and announced; nothing overflows at 375px

## 9. Close out

- [ ] 9.1 Rework the linter's table-driven fixtures from per-rule-per-body to per-rule-per-line, adding mixed-body cases the old suite could not express
- [ ] 9.2 Confirm the whole suite passes with `AI_PROVIDER=null`
- [ ] 9.3 `openspec validate line-by-line-linter --strict`

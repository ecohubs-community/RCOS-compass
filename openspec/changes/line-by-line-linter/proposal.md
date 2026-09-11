## Why

The linter judges a whole body against a single type. Governance prose does not
work that way: the guide's test is per line — *what breaks if we delete this
line?* A decision or an audit changes, and the line is enforceable. An ambiguous
call loses its default, and it is interpretive. Who the community attracts
changes, and it is expressive. Nothing changes, and it is clutter that should be
cut.

So a definition mixing a rule and a value gets one label, and every line the
label does not fit goes unchecked. What a community loses is precisely the case
the guide calls the dangerous one: **a line that sounds binding but has no test**,
sitting unlabelled beside real rules. Nobody can tell which of the two binds
them, and the ambiguity is the opening for informal enforcement — a rule applied
by whoever feels strongly, with nothing to appeal to. Compass exists to make
governance checkable, and the check that matters most is the one it cannot
currently run.

`docs/11-definition-linter.md` already half-knows this: §2's own message reads
*"Say what job this **line** does"* while the implementation applies it to the
body, and §7 says the ambiguous middle is caught by three rules together — none
of which fire unless a type was chosen for everything at once.

Reasoning: `docs/11-definition-linter.md` §§1–2, 7; `docs/03-data-model.md` §5
(definition versions); `design_files/platform/RCOS Compass.dc.html` screens 03
(annotated definition), 03b (before the linter has run), 06 (the proposal rail).

## What Changes

- **A line is the unit of judgement.** `lint()` splits the body into lines,
  infers each one's job, and checks it against the rules for that job.
  **BREAKING**: `lint()` stops returning a flat `Finding[]`. Jobs are inferred
  only — nobody declares one in this change, and the result records that, so
  author-declared labels can land later without a second result shape.
- **A finding knows which line it is about.** `Finding` gains a line anchor, which
  is what lets the screens render annotations beside the text, count "3 of 4
  lines carry a test", and offer a remedy on the line that needs one.
- **The ambiguous middle becomes a rule of its own.** A line whose language binds,
  that carries no test anyone could check yes or no, and that is not labelled
  non-binding, is reported — and its remedy is a choice between three governance
  acts (bind it, mark it as a value, cut it), never a rewrite the linter proposes.
- **Clutter becomes the fourth outcome, and the quietest.** A line that binds
  nobody, frames no trade-off, says nothing about who the community is, and adds
  nothing to a definition already adopted, is reported as doing no job — advisory
  severity, naming what it duplicates where it duplicates something. It never
  fires on a line already reported as the ambiguous middle, because telling
  somebody to delete a line that might be a rule is the wrong advice.
- **The type stops being an input and becomes a derived summary.** **BREAKING**:
  `definition_version.type` and `definition_draft.type` are no longer chosen by
  the author for the whole body. The primary job is computed as the strongest job
  present among labelled lines, and shown read-only wherever one word per
  definition is needed — the definitions list, the register.
- **A lint result is stored and re-run explicitly, never on read.** Today the
  discussion page lints on every page load. `definition_version.linter_result`
  already exists; `post` gains the same. Until a run exists there is nothing to
  split by, so the annotated view is unavailable and the prose is what shows.
- **Posting a proposal runs the linter once**, so the rail is never blank for
  want of someone pressing a button. The explicit run stays, for definitions that
  arrived through document mapping and never passed an editor.

## Capabilities

### New Capabilities

- `definition-linter`: what the linter judges and how — the line as the unit, the
  jobs a line can have, the ambiguous middle, clutter, how a primary job is
  derived, and when a result is computed, stored and re-run. Currently spread
  across the `definitions` spec and `docs/11`; it is its own thing and about to
  get bigger.

### Modified Capabilities

- `definitions`: a version records a per-line linter result rather than a flat
  one, and its type is derived from that result rather than chosen.

## Impact

**A requirement the code has never met.** `freeze` writes `linterResult: null`
onto every `definitionVersion` it creates, and so does the other insert site —
while the `definitions` spec requires a version to store its linter result.
Nothing has ever stored one. This change closes that half, because it is the
change that gives a version a result worth storing.

The other half of that requirement — *whether AI assisted it* — stays open, and
deliberately. `aiAssisted` is written `false` in both places and read nowhere,
and **nothing anywhere records that a draft was written with help**, so there is
no flag to carry into the version. Closing it means recording assistance at the
point it happens, which belongs to the AI surface rather than to the linter.
Stated here so the gap is a known one rather than a surprise.

**Schema.** `post.linter_result`; `definition_version.type` and
`definition_draft.type` become derived — written by the lint run rather than by
the author. The columns stay; what writes them changes. **A migration must
back-fill** the per-line shape for every existing version, or accept that
versions frozen before this change carry a flat result the new screens cannot
annotate.

**Linter.** `linter/index.ts` restructured around lines; `shared/linter.ts`
`Finding` gains its anchor; the existing signal regexes are reused unchanged —
this is a change of unit, not of vocabulary.

**Screens.** Definition detail gains the `Plain text | Line by line` toggle and
the not-yet-run state (03, 03b). The definition draft editor loses its type
selector. The discussion rail's linter card renders per-line findings and gains
its own not-yet-run state — an artboard the design does not yet have.

**Docs.** `docs/11-definition-linter.md` §2 is rewritten around the line, and §7's
"three rules together" becomes the one rule it was describing.

**Tests.** The linter's table-driven fixtures are per-rule against a whole body;
they become per-rule against a line, plus mixed-body cases the current suite
cannot express.

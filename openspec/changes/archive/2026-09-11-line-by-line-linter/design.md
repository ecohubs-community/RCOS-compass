## Context

`lint()` takes one body and one type and returns a flat `Finding[]`. The signal
vocabulary it uses — `OBLIGATION`, `SUBJECT`, `PROCESS`, `CONSEQUENCE`,
`TRADEOFF`, `DEFAULTING`, `NONBINDING` — is good and stays. What is wrong is the
unit it applies them to.

`docs/11-definition-linter.md` §2 already writes the message as *"Say what job
this **line** does"*, and §7 describes the ambiguous middle as three rules acting
together. Neither is deliverable while the type is one value for the whole body:
a body labelled enforceable never runs the expressive rules, so the value sitting
in the middle of four rules is never examined at all.

This change is therefore a change of *unit*, not of vocabulary. Most of the rule
bodies survive; the function around them does not.

Design: `design_files/platform/RCOS Compass.dc.html`, screens 03 (annotated), 03b
(not yet run), 06 (the rail).

## Goals / Non-Goals

**Goals**

- Each line is judged against its own job, and a mixed body is normal.
- The ambiguous middle is caught and given two ways out.
- A stored result is what the screens read; nothing lints on a page load.
- A definition's type stops being a question the author has to answer.

**Non-Goals**

- New rule *content* beyond the ambiguous middle. The existing rules are ported
  to the line, not rewritten.
- Turning the assisted rules into per-line AI calls. They stay as they are, run
  once per body, and still degrade to silence.
- Re-linting frozen versions. A version's stored result described the text as it
  was judged then; recomputing it retroactively would change what the record says
  happened.
- The proposal rail's layout, which belongs to `discussion-detail-rail`.

## Decisions

### A line is a sentence within a block, found with `Intl.Segmenter`

**Chosen:** split the plain text into blocks (paragraph, list item), then into
sentences within each block, using `Intl.Segmenter` with `granularity: 'sentence'`
and the community's locale.

The guide's test — *what breaks if we delete this line?* — is a test you apply to
a sentence. The design's own artboards confirm it: screen 03 renders "A person
admitted by the Welcome Circle holds candidate status for six months." and
"Candidates take part in all discussions…" as two separately-badged lines of one
paragraph.

Splitting on newlines was the cheap alternative and is wrong for the actual
corpus: governance prose imported from a community's existing statutes arrives as
paragraphs, and would be judged as one line each — reproducing today's bug with
extra steps.

`Intl.Segmenter` is in Node 24 and needs no dependency, and it is locale-aware,
which matters because Compass is multilingual and the vagueness lists are already
per-locale. A list item is treated as its own block even when it is not a full
sentence, because a numbered obligation is exactly the shape a rule takes.

### Inference only, and the result says so

**Chosen:** every line's job is inferred in this change. Nobody declares one.
The result still carries the field that records *how* a job was arrived at, so
author-declared labels can land later without a migration or a second result
shape.

Inference assigns a job only on an unambiguous read; anything else is unlabelled.
The temptation is to always assign something, because a badge on every line looks
finished — but an inferred `expressive` on a line that actually binds is worse
than no badge, because it tells a reader the line is safe to ignore. Unlabelled
is a state the screens render (the `?` badge in the design), and the ambiguous
middle is the finding that fires on its dangerous subset.

Declaration is deferred rather than dropped because there is nowhere to put it
yet: the proposal editor does not exist, and adding per-line controls to the
definition draft editor in the same change that removes its type selector would
be two arguments at once.

### Clutter renders inline, like every other finding

**Chosen:** a clutter finding sits on its line, in the same shape as a vagueness
warning or a missing consequence.

The alternative was gathering them into one "these lines do nothing" note at the
foot of the panel, on the theory that it reads as less accusatory. It reads as
less *legible*: a reader then has to map a list of line numbers back onto the
text, and a finding you have to go looking for is a finding people stop reading.
Consistency wins — one place a finding can appear, whatever it says. The rule's
restraint lives in its severity and in how rarely it fires, not in hiding it.

### Clutter is a rule, and it is the quietest of the four

**Chosen:** `line.clutter`, advisory severity, firing when a line binds nobody,
frames no trade-off or default, carries no identity language, and adds nothing to
an adopted definition. It never fires on a line already reported as the ambiguous
middle.

This is the guide's fourth outcome and it belongs in the set. It is also the one
rule that tells a community to delete its own words, which is a different kind of
advice from the other three: being wrong about "this line has no consequence" is
a correction; being wrong about "this line does nothing" is telling somebody that
what they wrote does not matter.

So it is deliberately the weakest rule of the four, and errs toward silence. Two
things make that tractable. First, the `all.duplicate` machinery and its
`adoptedElsewhere` input already exist, so the *strongest* clutter signal — this
restates a rule we already adopted — is a real check rather than a guess, and the
finding can name what it duplicates. Second, the exclusion against the ambiguous
middle removes the dangerous overlap: a line that sounds binding but has no test
looks empty to every signal the clutter rule reads, and the right advice there is
"push it to one side", never "delete it".

### The ambiguous middle is one rule, not three in concert

**Chosen:** `line.ambiguous-middle`, firing when the line's language binds AND it
carries no checkable criterion AND it is not marked non-binding.

`docs/11` §7 describes this as `type.mismatch` + `int.absolute` +
`exp.obligation` acting together. That works when the author has chosen a type
and the rules can disagree with it. It cannot work for an unlabelled line, which
is exactly the case the guide warns about — an unlabelled value sitting beside
real rules. Making it one rule means it fires on the case that matters and can
carry its own remedy.

The remedy is three buttons — make it enforceable, label it non-binding, delete
it — and the linter offers all three without choosing, as screen 03 draws them.
This is the one place the linter's output is actionable rather than advisory, and
it must not become a recommendation: binding a line, marking it as a value and
cutting it are three different governance choices, and only the community can
make one.

Delete belongs here as a *choice* while the clutter rule offers it as *advice*,
and the difference is the point. On an ambiguous-middle line the author may know
the line is empty; the linter does not, and must not say so.

### The primary job is derived by strength, not by majority

**Chosen:** enforceable > interpretive > expressive; the strongest job present
among labelled lines wins.

Majority was the obvious alternative and is dangerous here. A definition with
four expressive lines and one enforceable line is, for anyone bound by it, an
enforceable definition — and a majority rule would label it expressive, which is
precisely the "demote an enforced rule into a value" anti-pattern `docs/11` §7
already names. Strength cannot make that mistake.

The primary job stays because the definitions list and the register need one word
per definition. It becomes read-only everywhere, and the draft editor loses its
type selector.

### The stored result carries a shape version

**Chosen:** the persisted JSON carries the version of the result shape that
produced it, and a reader that does not recognise a shape falls back to prose.

`definition_version.linter_result` is already a JSON column with results in
today's flat shape, stored against frozen versions that must not be recomputed.
Those rows outlive this change. Without a stamp, a screen written for the new
shape would either crash on them or silently render an empty annotation, which
reads as "this definition is clean" — the worst possible failure for a linter.

### Frozen versions keep their result and their type; nothing is back-filled

A frozen version's `linter_result` recorded what the linter said about that text
at that moment, and `type` recorded what its author claimed. Recomputing either
would rewrite history in a system whose register is append-only. The new rules
apply to everything from here; older versions render as prose with the annotated
view unavailable, and the definitions spec delta says so as a scenario rather
than leaving it to be discovered.

### Running on write, and keeping the explicit run

Posting a proposal runs the linter once and stores the result — the rail is never
blank because nobody pressed a button, and `docs/11` §1's "never on read" is
respected, since a write is not a read.

The explicit "Run the linter" stays, and is not vestigial: definitions arriving
through document mapping are created from confirmed evidence and never pass
through an editor, so they genuinely have no result. Screen 03b is their state,
and re-running after an edit is the same act.

The run is synchronous. The rule-based rules are regex work on a few hundred
words; the assisted rules already have their own provider path and their own
degradation, and pushing the whole run into the job queue would mean a proposal
that is posted and then briefly has no linter card for reasons the member cannot
see.

## Risks / Trade-offs

**Sentence segmentation gets it wrong** — abbreviations, "e.g.", section
references like "§3.6", decimal numbers. → `Intl.Segmenter` handles the common
cases better than a hand-rolled regex would, and the failure mode is a line split
in two or two joined, which produces a confusing badge rather than a wrong
verdict. The fixture suite carries the abbreviation and reference cases from the
actual standard text.

**Per-line badges make a definition look like a form to fill in**, and a
community may start labelling lines to make warnings go away rather than to say
what they mean. → The ambiguous-middle remedy is deliberately two buttons with no
default, so the cheap way out is not obvious. Worth watching in the pilot; it is
a product signal, not a bug.

**`type` becoming derived is a behaviour change on an existing column**, and
anything reading it expecting an author's choice keeps working but now reads a
computed value. → The callers are enumerable and change in the same commit; the
draft editor's selector is removed rather than disabled, so nothing can write it.

**A body of many short lines produces many findings**, and the panel becomes a
wall. → The screens summarise ("3 of 4 lines carry a test") and expand on demand,
which is what the design already draws. The linter returns everything; the panel
decides what to show first.

**Assisted rules stay whole-body while the rest go per-line**, so their findings
have no line anchor. → They are reported against the body, and the result shape
allows a finding with no line. The alternative — one AI call per line — multiplies
cost and budget consumption by the number of sentences for no gain the rules can
currently use.

## Migration Plan

1. **`shared/linter.ts`**: `Finding` gains an optional line anchor; the new
   result shape is added beside the existing one, with its version stamp.
2. **`linter/index.ts`**: segmentation, per-line dispatch, the ported rules, the
   ambiguous middle, the derived primary job. The signal regexes move unchanged.
3. **`post.linter_result`** added; `addProposal` runs the linter and stores it.
4. **Remove the `lint()` call from the discussion page's `load`**, which is the
   only on-read run in the codebase.
5. **Draft editor** loses its type selector; the draft and version writers take
   the derived value.
6. **Screens**: the definition detail toggle and not-yet-run state; the rail's
   linter card and its not-yet-run state.
7. **No data migration.** Old results keep their shape and are recognised by
   their absent stamp. Old `type` values stand.
8. **Rollback** is code-only. Results written in the new shape would be
   unreadable by the old code, so the rollback window is before the first new
   proposal is posted; after that, forward-fix.

## Open Questions

- The design's rail defaults to "Line by line" selected while screen 03b says
  prose is the default until a run exists. Consistent once every proposal is
  linted on write; the missing artboard is the rail for a proposal written before
  this change landed.

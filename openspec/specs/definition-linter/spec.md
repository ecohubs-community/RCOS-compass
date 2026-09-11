# definition-linter Specification

## Purpose
Covers what the linter judges and how: the line is the unit, not the definition — each line gets one job, inferred conservatively and recorded as inferred; the ambiguous middle is reported and offered three ways out; a line that does no job is reported as clutter; the primary job of a body is derived from its lines and never chosen; and a result is stored with the text it judged, never computed on read.

## Requirements
### Requirement: A line is the unit the linter judges

The linter MUST split a body into lines and judge each line on its own. Each
line MUST be assigned exactly one job of `enforceable`, `interpretive` or
`expressive`, or be reported as having none — either because it could not be
placed, or because it does no job at all. A body MUST be able to carry lines
of different jobs, and MUST NOT be reported as inconsistent for doing so.

Every finding MUST name the line it is about.

#### Scenario: A body mixing a rule and a value
- **WHEN** a body containing one enforceable line and one expressive line is linted
- **THEN** each line is judged against the rules for its own job
- **AND** neither is reported as wrong for sitting beside the other

#### Scenario: A finding is placed
- **WHEN** a rule fires on the third line of a five-line body
- **THEN** the finding names the third line
- **AND** no finding is attributed to a line the rule did not read

#### Scenario: A single-line body
- **WHEN** a body of one line is linted
- **THEN** it is judged as one line, and the result carries one line

#### Scenario: An empty body
- **WHEN** a body with no lines is linted
- **THEN** the result carries no lines and no findings, and is not an error

### Requirement: A line's job is inferred, conservatively, and inference says it is inference

A line's job MUST be inferred from its text, and the result MUST record that the
job was inferred rather than stated by anyone. An inferred job MUST NOT be
presented as the author's choice.

Inference MUST be conservative: a line that does not read unambiguously as one
job MUST be reported as unlabelled rather than assigned a job by default.

#### Scenario: The linter infers a job
- **WHEN** a line reads unambiguously as one job
- **THEN** the job is assigned and recorded as inferred

#### Scenario: The linter cannot place a line
- **WHEN** a line matches no job unambiguously
- **THEN** the line is reported as unlabelled
- **AND** no job is assumed for it

#### Scenario: A job is never shown as a person's claim
- **WHEN** a result is rendered
- **THEN** every job on it reads as the linter's reading, not as a label anyone applied

### Requirement: The ambiguous middle is reported and pushed to one side

A line MUST be reported as the ambiguous middle when its language binds, it
carries no criterion anyone could check yes or no, and it is not labelled
non-binding.

The finding MUST offer every way out — making the line enforceable, labelling it
non-binding, and deleting it — and MUST NOT choose between them or present one as
preferred. It MUST NOT prevent a freeze, and it MUST NOT perform any of the three.

#### Scenario: A binding-sounding line with no test
- **WHEN** a line reads "Candidates are expected to show up with humility" and is unlabelled
- **THEN** it is reported as the ambiguous middle
- **AND** the finding offers making it enforceable, labelling it non-binding, and deleting it, with none preferred

#### Scenario: The same sentiment labelled non-binding
- **WHEN** the same line is labelled expressive and carries a non-binding marker
- **THEN** it is not reported as the ambiguous middle

#### Scenario: A binding line that carries a test
- **WHEN** a line binds and states a criterion that can be checked yes or no
- **THEN** it is not reported as the ambiguous middle

#### Scenario: A line that describes without binding
- **WHEN** a line uses no obligation language
- **THEN** it is not reported as the ambiguous middle

#### Scenario: Freezing over it
- **WHEN** a community freezes a version containing an ambiguous-middle line
- **THEN** the freeze succeeds and the finding is stored with the version

### Requirement: A line that does no job is reported as clutter

A line MUST be reported as clutter when nothing about the community changes if it
is deleted: it binds nobody, names no trade-off or default, says nothing about
who the community is, and adds nothing to a line already adopted elsewhere.

The finding MUST be advisory rather than blocker-shaped, and MUST propose
deleting the line without performing it. It MUST NOT fire on a line that has
been reported as the ambiguous middle, because that line's problem is that it may
bind, and telling somebody to delete a possible rule is the wrong advice.

Where the line's emptiness is that it restates something the community has
already adopted, the finding MUST name what it duplicates.

#### Scenario: A line that restates an adopted definition
- **WHEN** a line repeats a rule already adopted in another definition
- **THEN** it is reported as clutter, naming the definition it duplicates

#### Scenario: Connective prose
- **WHEN** a line binds nobody, frames no trade-off, carries no non-binding marker and says nothing about the community's identity
- **THEN** it is reported as clutter

#### Scenario: An expressive line is not clutter
- **WHEN** a line says who the community is and what it attracts
- **THEN** it is judged expressive and is not reported as clutter

#### Scenario: The ambiguous middle is not reported as clutter
- **WHEN** a line qualifies as both the ambiguous middle and as doing no job
- **THEN** only the ambiguous middle is reported
- **AND** deleting the line remains one of its three remedies, offered as a choice rather than as advice

#### Scenario: The community keeps it
- **WHEN** a community freezes a version containing a line reported as clutter
- **THEN** the freeze succeeds and the finding is stored with the version

### Requirement: The primary job is derived, never chosen

A body's primary job MUST be computed from the jobs of its lines and MUST NOT be
entered by an author. Where lines carry different jobs, the primary job MUST be
the strongest present, ordered enforceable, then interpretive, then expressive.

A body whose lines carry no job MUST have no primary job, rather than a default
one. The primary job MUST be presented as a summary and MUST NOT be editable.

#### Scenario: Every line is enforceable
- **WHEN** all lines are enforceable
- **THEN** the primary job is enforceable

#### Scenario: A body mixes jobs
- **WHEN** a body carries three expressive lines and one enforceable line
- **THEN** the primary job is enforceable, because it is the strongest present

#### Scenario: A body carries only interpretive and expressive lines
- **WHEN** no line is enforceable
- **THEN** the primary job is interpretive

#### Scenario: No line carries a job
- **WHEN** every line is unlabelled
- **THEN** the body has no primary job

#### Scenario: An author tries to set it
- **WHEN** a request supplies a primary job for a body
- **THEN** it is ignored, and the derived value is stored

### Requirement: A lint result is stored with what it judged, and is never computed on read

A lint result MUST be stored against the version or proposal it judged. Reading a
definition or a proposal MUST NOT run the linter.

Until a result exists, the annotated view MUST be unavailable and the prose MUST
be shown instead, with the reason stated. Re-running MUST be an explicit act, and
MUST replace the stored result rather than adding to it.

Posting a proposal MUST run the linter once, so that a proposal on the table
carries a result without anyone asking for one.

#### Scenario: A definition is read
- **WHEN** a member opens a definition that has a stored result
- **THEN** the stored result is shown and no lint runs

#### Scenario: A definition that has never been linted
- **WHEN** a member opens a definition with no stored result
- **THEN** the prose is shown, the annotated view is unavailable, and the screen says the linter has not run
- **AND** running it is offered

#### Scenario: A proposal is posted
- **WHEN** a member posts a proposal
- **THEN** the linter runs once and the result is stored with that version

#### Scenario: A proposal is read
- **WHEN** a member opens a discussion whose proposal carries a result
- **THEN** the stored result is shown and no lint runs

#### Scenario: The text changes
- **WHEN** a new version is posted
- **THEN** it carries its own result, and the previous version keeps the result that judged its own text

#### Scenario: A re-run
- **WHEN** a member re-runs the linter
- **THEN** the stored result is replaced and the time of the run is recorded

#### Scenario: A member of another community re-runs it
- **WHEN** a member of community B re-runs the linter on a definition belonging to A
- **THEN** it is refused, and A's stored result is unchanged

### Requirement: The line rules run without a provider

Every line-level rule except those marked as assisted MUST run with no AI
provider configured. An assisted rule without a provider MUST report that it did
not run, and MUST NOT report a line as having passed a check nobody performed.

#### Scenario: No provider is configured
- **WHEN** a body is linted with the `null` provider
- **THEN** every line still carries its rule-based findings
- **AND** the assisted checks are reported as not run

#### Scenario: The ambiguous middle without a provider
- **WHEN** a body containing an ambiguous-middle line is linted with no provider
- **THEN** the line is still reported, because the rule reads text alone

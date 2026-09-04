## ADDED Requirements

### Requirement: A freeze produces the decision, the version and the change-log entry atomically

A freeze MUST create the decision record, the definition version it adopts, and
the change-log entry in one transaction. If any part fails, none MUST be visible.

#### Scenario: A freeze succeeds
- **WHEN** a steward freezes a proposal
- **THEN** a decision, an adopted version and a change-log entry all exist
- **AND** the definition's adopted version is the new one

#### Scenario: A freeze fails part-way
- **WHEN** the write fails after the decision row is prepared
- **THEN** no decision, no version and no change-log entry are stored
- **AND** no reference number has been consumed

### Requirement: Decision references are gapless and permanent

Each decision MUST receive a per-community sequence number allocated inside the
freeze transaction, and a reference of the form `DEC-<year>-<seq>` where the year
is the freeze date in the community's own timezone. A reference MUST never be
reused or renumbered.

#### Scenario: Three decisions in a row
- **WHEN** three freezes succeed in one community
- **THEN** their sequence numbers are consecutive with no gaps

#### Scenario: A freeze rolls back between two successful ones
- **WHEN** a freeze fails and another then succeeds
- **THEN** the successful one takes the number the failed one did not consume

#### Scenario: A community east of UTC freezes late in the evening
- **WHEN** a community whose timezone is ahead of UTC freezes at 23:59 local on 31 December
- **THEN** the reference carries the local year, not the server's

#### Scenario: Two communities freeze
- **WHEN** community A and community B each freeze for the first time
- **THEN** each gets sequence 1, because the counter is per community

### Requirement: A duplicate freeze returns the first decision

A freeze MUST carry an idempotency key issued when the form was rendered. A second
submission with the same key MUST return the decision already created and MUST
NOT create a second one or consume a second number.

#### Scenario: Freeze is pressed twice
- **WHEN** the same freeze form is submitted twice
- **THEN** one decision exists
- **AND** the second submission returns that same decision

#### Scenario: A key from a different form
- **WHEN** a freeze is submitted with a key no decision carries
- **THEN** it is treated as a new freeze

### Requirement: A proposal can be frozen once

Freezing MUST record the decision on the proposal, and MUST refuse a proposal
that has already been frozen, naming the decision that exists.

#### Scenario: Two stewards freeze the same proposal
- **WHEN** two stewards submit separate freeze forms for one proposal
- **THEN** exactly one decision is created
- **AND** the second is refused with the reference of the first

#### Scenario: A superseding decision is wanted
- **WHEN** a community wants to change what it decided
- **THEN** it must produce a new proposal, because the old one is spent

### Requirement: A decision quotes a clause reference and keeps quoting it

A decision MUST record, for each clause it answers, the standard, the version and
the reference **as they stood at decision time**, alongside the stable clause key.
No migration or standard upgrade MUST rewrite a stored reference.

#### Scenario: A decision is recorded
- **WHEN** a decision answering clause `3.6.3` of core 0.1 is frozen
- **THEN** it stores the standard, the version `0.1`, the reference `3.6.3` and the clause key

#### Scenario: The standard renumbers the clause
- **WHEN** a later version of the standard gives that obligation a different reference
- **THEN** the existing decision still reads `3.6.3` at version 0.1
- **AND** the clause key still resolves it to the same obligation

### Requirement: Re-freezing supersedes rather than rewrites

Freezing a definition that already has an adopted version MUST mark the previous
decision superseded and record what replaced it. The superseded decision's
reference, text and tally MUST remain unchanged and its permalink MUST keep
resolving.

#### Scenario: A definition is decided a second time
- **WHEN** a new decision adopts a new version of a definition
- **THEN** the previous decision is marked superseded and names the new one
- **AND** its own reference, text and tally are unchanged

#### Scenario: An old reference is quoted
- **WHEN** someone opens the superseded decision's permalink
- **THEN** it resolves, says it was superseded, and links to the decision that replaced it

### Requirement: Who was present is recorded, and so is their consent to be named

A freeze MUST record who was present, and for each named person MUST record
whether they consented to being named outside the community.

#### Scenario: A decision is frozen with attendees
- **WHEN** a steward records who was present
- **THEN** each attendee is stored with their consent-to-publish flag

#### Scenario: Nobody consented
- **WHEN** no attendee consented to being named
- **THEN** the decision still records the count, so a tally is possible without names

### Requirement: The change log is append-only

Every change-log entry MUST be immutable once written. No interface MUST offer to
edit or remove one.

#### Scenario: A freeze writes an entry
- **WHEN** a decision is frozen
- **THEN** a change-log entry records the actor, the time and what changed

#### Scenario: Editing is attempted
- **WHEN** a write is attempted against an existing entry
- **THEN** it is refused

### Requirement: A suspended community records nothing new

While a community is suspended it MUST refuse writes, including freezing, while
continuing to serve reads and exports.

#### Scenario: A steward freezes in a suspended community
- **WHEN** the freeze is submitted
- **THEN** it is refused and no decision is created

#### Scenario: The register is read
- **WHEN** a member of a suspended community opens the decision register
- **THEN** it is served

### Requirement: A decision is findable a year later

Every decision MUST have a permalink, MUST appear in the register with its type,
layer, date, review date, mechanism and tally, and MUST be findable by searching
for the question it answers.

#### Scenario: A decision is looked up by reference
- **WHEN** its reference is opened
- **THEN** the decision, the proposal text as adopted, its rationale and its related clauses are shown

#### Scenario: A member asks a question in their own words
- **WHEN** a member searches for wording that appears in an adopted definition
- **THEN** the decision and the clause it answers are both offered

#### Scenario: A member of another community opens the permalink
- **WHEN** they request it
- **THEN** the answer is the same as for a decision that does not exist

### Requirement: Decisions taken before the community has a Decision Matrix are provisional

While the Decision Matrix artifact is incomplete, every freeze MUST mark its
decision and the version it adopts as provisional, and the application MUST offer
a list of everything awaiting ratification.

#### Scenario: Freezing without a Decision Matrix
- **WHEN** a community freezes before adopting its Decision Matrix
- **THEN** the decision is recorded as provisional and the notice says so before it is confirmed

#### Scenario: The Decision Matrix is adopted later
- **WHEN** the Decision Matrix becomes complete
- **THEN** every provisional decision is listed for ratification

#### Scenario: A provisional decision is ratified
- **WHEN** a community ratifies one
- **THEN** a new decision records the ratification
- **AND** the original decision's history is not rewritten

### Requirement: The platform writes the Ratification Record

For a section the standard marks as filled from a decision, the application MUST
render the record from the decision that adopted the artifact, MUST NOT ask a
community to write it, and MUST NOT count it toward artifact completeness.

#### Scenario: An artifact is adopted
- **WHEN** a community adopts an artifact
- **THEN** its Ratification Record shows that decision's reference, date, mechanism and tally

#### Scenario: The community's queue of work
- **WHEN** the outstanding sections for an artifact are listed
- **THEN** no Ratification Record appears among them

#### Scenario: An artifact with every authored section adopted
- **WHEN** every authored section of a mandatory artifact has an adopted definition
- **THEN** the artifact is complete, even though nobody wrote its Ratification Record

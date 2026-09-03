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

#### Scenario: Two people freeze the same proposal
- **WHEN** two stewards submit different freeze forms for one proposal at the same time
- **THEN** exactly one decision is created

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

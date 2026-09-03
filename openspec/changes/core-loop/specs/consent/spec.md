## ADDED Requirements

### Requirement: An objection is a record with a reason and a lifecycle

An objection MUST carry a reason and a state of `open`, `withdrawn`, `addressed`
or `overruled`. An objection MUST NOT be deletable, and its state changes MUST be
attributable.

#### Scenario: An objection is raised
- **WHEN** a member objects to a proposal with a reason
- **THEN** the objection is recorded as open, with its author

#### Scenario: An objection is resolved
- **WHEN** a steward marks it addressed
- **THEN** the state changes and records who changed it and when

#### Scenario: Deletion is attempted
- **WHEN** a request tries to remove an objection
- **THEN** it is refused

### Requirement: A decision frozen over an open objection says so, permanently

Freezing MUST be permitted while objections are open, and the resulting decision
MUST record the count of unresolved objections and display it wherever the
decision is shown.

#### Scenario: Freezing with an unresolved objection
- **WHEN** a steward freezes a proposal that has one open objection
- **THEN** the decision is created
- **AND** it reads as frozen with 1 unresolved objection in the register and on its permalink

#### Scenario: All objections resolved before freezing
- **WHEN** every objection is withdrawn or addressed before the freeze
- **THEN** the decision carries no unresolved-objection note

### Requirement: A consent round collects one response per member and closes

A consent round MUST have a deadline and a set of eligible members, MUST accept at
most one response per member of `consent`, `objection` or `abstain`, and MUST
close at its deadline or when every eligible member has responded.

#### Scenario: A member responds twice
- **WHEN** a member submits a second response to the same round
- **THEN** their earlier response is replaced, not duplicated

#### Scenario: Someone outside the community responds
- **WHEN** a member of another community submits a response
- **THEN** it is refused and nothing is recorded

#### Scenario: The deadline passes
- **WHEN** the deadline is reached with some members not having responded
- **THEN** the round closes and reports how many of how many responded

#### Scenario: Everyone responds early
- **WHEN** the last eligible member responds before the deadline
- **THEN** the round closes immediately

### Requirement: A round informs a freeze and never performs one

A closed round MUST produce a tally that pre-fills the freeze. Closing a round
MUST NOT create a decision, a version or a change-log entry.

#### Scenario: A round closes
- **WHEN** a consent round reaches its deadline
- **THEN** no decision exists yet

#### Scenario: The freeze is opened after a round
- **WHEN** a steward opens the freeze form for a proposal with a closed round
- **THEN** the mechanism, threshold, who was present and the tally are pre-filled from it
- **AND** every one of them can still be changed by the person freezing

#### Scenario: A community ignores the round
- **WHEN** a steward freezes with a tally that differs from the round's
- **THEN** the decision records the tally the steward entered

### Requirement: Voting runs behind a provider interface

Consent rounds MUST be reached through a voting-provider interface, so a second
provider can be added without changing the freeze.

#### Scenario: The built-in provider is used
- **WHEN** a round is opened with no provider named
- **THEN** the built-in consent round is used

#### Scenario: The freeze consumes a tally, not a round
- **WHEN** the freeze path is inspected
- **THEN** it depends on a tally and on no provider-specific type

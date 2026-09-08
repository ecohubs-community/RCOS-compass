## ADDED Requirements

### Requirement: Adopting a standard or a module is a decision

A community MUST record a decision for each of these: making a module active,
and moving to a new version of a standard. The decision that adopts a version MUST
reference the re-affirmation decisions made while migrating to it.

#### Scenario: A module is adopted
- **WHEN** the adopting decision is frozen
- **THEN** the register shows it like any other decision

#### Scenario: A version is adopted
- **WHEN** a migration completes
- **THEN** one decision records it and names the re-affirmations behind it

### Requirement: A decision keeps the clause reference it was made against

A decision's clause references MUST record the standard, version, reference and
key as at the moment it was frozen, and MUST NOT be rewritten when the community
moves to a new version. Where a reader would benefit, the current location of the
clause MAY be shown alongside, derived at display time.

#### Scenario: A migration completes
- **WHEN** decisions from before it are read
- **THEN** each still quotes the version and reference it was made against

#### Scenario: The clause moved
- **WHEN** a decision quotes a reference that is numbered differently in the version now in force
- **THEN** the original is shown, and where it went may be shown beside it

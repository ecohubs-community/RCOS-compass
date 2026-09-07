## ADDED Requirements

### Requirement: Publishing an artifact is itself a decision

Making an artifact world-readable MUST write a decision record. The register MUST
show what was published, by whom and when, alongside every other decision.

#### Scenario: An artifact is published
- **WHEN** a steward publishes an artifact
- **THEN** a decision recording the publication appears in the register

#### Scenario: A community asks when something went public
- **WHEN** a member looks for when an artifact became world-readable
- **THEN** the register answers it

### Requirement: A decision carries the visibility of what it adopted

A freeze MUST record the visibility the adopted definition has, and changing that
visibility later MUST NOT rewrite the decision.

#### Scenario: A definition is adopted while member-visible
- **WHEN** a freeze completes
- **THEN** the decision records that the definition was member-visible at adoption

#### Scenario: The definition is published later
- **WHEN** the definition is published after being adopted
- **THEN** the original decision still says what was true when it was frozen

## MODIFIED Requirements

### Requirement: Who was present is recorded, and so is their consent to be named

A freeze MUST record who was present, and for each named person MUST record
whether they consented to being named outside the community.

Consent MUST be per attendee. No community-level setting MUST be able to publish
the name of an attendee who did not consent, and the absence of consent MUST NOT
prevent the count from being published.

#### Scenario: A decision is frozen with attendees
- **WHEN** a steward records who was present
- **THEN** each attendee is stored with their consent-to-publish flag

#### Scenario: Nobody consented
- **WHEN** no attendee consented to being named
- **THEN** the decision still records the count, so a tally is possible without names

#### Scenario: The community publishes names
- **WHEN** a community sets its attribution policy to names and publishes a decision
- **THEN** only attendees who consented individually are named
- **AND** the others are still counted in the tally

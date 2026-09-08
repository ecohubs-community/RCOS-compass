## MODIFIED Requirements

### Requirement: Who was present is recorded, and so is their consent to be named

A freeze MUST record who was present, and for each named person MUST record
whether they consented to being named outside the community.

Consent MUST be per attendee. No community-level setting MUST be able to publish
the name of an attendee who did not consent, and the absence of consent MUST NOT
prevent the count from being published.

Attendance MUST reference the membership rather than a name held on the decision,
so that a person can be erased without the record changing. An erased attendee
MUST render as their community's former-member label, inwardly and outwardly,
and MUST still be counted.

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

#### Scenario: An attendee is erased
- **WHEN** a person who attended a frozen decision is erased
- **THEN** the decision's tally is unchanged and they render as a former member

#### Scenario: An erased attendee who had consented to be named
- **WHEN** the decision is read publicly after their erasure
- **THEN** their name does not appear, because there is no longer a name to show

## ADDED Requirements

### Requirement: The interview says what each answer will do, as it is answered

Each question MUST state which parts of the standard the answer moves, and why,
at the moment it is answered. An interview that reorders a community's work
without saying so MUST NOT ship.

#### Scenario: A community says it holds land
- **WHEN** a member answers that the community holds land
- **THEN** they are told which requirements this moves up, and why
- **AND** the path reflects it

#### Scenario: Every question earns its place
- **WHEN** the interview's questions are enumerated
- **THEN** each one has at least one answer that changes the ordering
- **AND** a question with no such answer fails the build, because it is noise

### Requirement: The interview is skippable, and says what skipping means

A community MUST be able to skip the interview and use the application fully. One
that skips MUST be told it is getting the structural ordering rather than left to
assume the list is tailored to it.

#### Scenario: A community skips it
- **WHEN** a community declines the interview
- **THEN** the path is ordered structurally
- **AND** the path screen says the ordering is not tailored, and offers the interview

#### Scenario: A community answers it later
- **WHEN** a community answers the interview after working for a while
- **THEN** the path reorders
- **AND** nothing already decided or drafted is affected

### Requirement: Answers can be changed, and changing them changes nothing but order

The profile MUST be editable, and MUST affect only the ordering — never
readiness, never compliance, never what a community has decided.

#### Scenario: A community's circumstances change
- **WHEN** a community that held no land answers that it now does
- **THEN** the path reorders
- **AND** readiness and the compliance claim are unchanged

### Requirement: The profile is the community's own, and stays inside it

Risk-profile answers MUST be visible only within the community that gave them,
MUST NOT be sent to a model, and MUST NOT appear on any public surface — they
describe the people in a community rather than its governance.

#### Scenario: A member of another community
- **WHEN** a steward of community B requests community A's profile
- **THEN** the answer is the same as for a profile that does not exist

#### Scenario: An AI task runs
- **WHEN** any AI task builds its input
- **THEN** no risk-profile answer is included

#### Scenario: The public surface
- **WHEN** anything is published outside the community
- **THEN** it contains no risk-profile answer

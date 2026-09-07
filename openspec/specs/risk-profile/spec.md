# risk-profile Specification

## Purpose
Covers the short interview that tailors a community's path: how each question states which parts of the standard its answer moves and why, at the moment it is answered; why answering is a settings act and reading is everybody's; how skipping it leaves the application fully usable and says plainly that the ordering is not tailored; that changing answers changes order and nothing else; and why the answers stay inside the community, out of every model input and off every public surface.
## Requirements
### Requirement: The interview says what each answer will do, as it is answered

Each question MUST state which parts of the standard the answer moves, and why,
at the moment it is answered. An interview that reorders a community's work
without saying so MUST NOT ship.

The profile is a settings object: answering it reorders the path for everybody,
so recording an answer requires `settings.manage`. Every member reads it and
sees what it did.

#### Scenario: A community says it holds land
- **WHEN** a steward answers that the community holds land
- **THEN** they are told which requirements this moves up, and why
- **AND** the path reflects it

#### Scenario: A member tries to answer
- **WHEN** a member without `settings.manage` records an answer
- **THEN** it is refused and the ordering is unchanged

#### Scenario: Every question earns its place
- **WHEN** the interview's questions are enumerated
- **THEN** each one has at least one answer that names sections it moves
- **AND** every named section exists in the standard
- **AND** a question naming none, or naming one the standard does not have, fails the build

#### Scenario: An answer names sections already at the top of their layer
- **WHEN** every section an answer names already outranks what the answer could lift it past
- **THEN** each named section still gains weight and says so in its reason
- **AND** nothing the answer did not name is touched

> Stated this way because the stronger phrasing — *every* answer moves a
> position — is not satisfiable against a day-one list and would have forced
> either a vacuous test or a mapping chosen for what moves rather than for what
> matters. The four sections the founder-veto question names are already the top
> of their layer, so the answer confirms the structural order rather than
> disturbing it. The interview as a whole MUST still change what a community
> sees.

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

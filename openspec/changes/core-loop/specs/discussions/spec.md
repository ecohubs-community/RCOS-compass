## ADDED Requirements

### Requirement: A discussion belongs to one community and one subject

A discussion MUST name the clause or definition it is about, and MUST be
reachable only from inside the community that owns it.

#### Scenario: A member opens a discussion on a clause with no definition
- **WHEN** a member starts a discussion from a clause
- **THEN** the discussion is created against that clause
- **AND** it appears in that community's discussion list

#### Scenario: A member of another community requests it
- **WHEN** a member of community B requests a discussion belonging to A
- **THEN** the answer is the same as for a discussion that does not exist

### Requirement: A proposal is a first-class object, not a post that looks different

A proposal MUST be a distinct record carrying its own text, version number and
author, MUST be attached to a discussion, and MUST be the only thing a freeze can
be based on.

#### Scenario: A proposal is written
- **WHEN** a member posts a proposal in a thread
- **THEN** it is recorded as a proposal with version 1

#### Scenario: A proposal is revised
- **WHEN** another proposal is posted in the same thread
- **THEN** it is version 2, and version 1 remains readable

#### Scenario: A freeze is attempted without a proposal
- **WHEN** a steward tries to freeze a discussion that has none
- **THEN** it is refused, and the reason names the missing proposal

### Requirement: Deciding in a room is a first-class path

A discussion MUST be able to be marked as decided offline, carrying a summary and
the proposal that came out of the meeting, and MUST then reach the same freeze
with the same required fields as any other path.

#### Scenario: A thread is taken offline and returns
- **WHEN** a member marks a discussion decided offline and enters a summary and a proposal
- **THEN** the thread records who wrote the summary and when
- **AND** the discussion can be frozen

#### Scenario: The record says how it was reached
- **WHEN** a decision is frozen from an offline path
- **THEN** the decision records that the discussion happened offline

### Requirement: A member may propose; recording remains with a steward

Any member MUST be able to start a discussion, comment, and post a proposal. Only
a steward MUST be able to freeze.

#### Scenario: A member posts a proposal
- **WHEN** a plain member posts a proposal
- **THEN** it is accepted

#### Scenario: A member attempts a freeze
- **WHEN** a plain member submits the freeze form
- **THEN** it is refused, and no decision is created

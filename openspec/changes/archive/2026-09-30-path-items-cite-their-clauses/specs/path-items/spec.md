## ADDED Requirements

### Requirement: A Path item cites every clause its section answers or relies on

A Path item MUST show every clause its section cites in the standard, through the
one component that formats a clause reference: the clauses the section owns
first, then the clauses it only references, marked as related. Each reference
MUST link to that clause in the standard browser. A Path item MUST NOT show a
raw clause key.

#### Scenario: A section owning three clauses
- **WHEN** a member opens the Path and "Voluntary Exit" is unanswered
- **THEN** its item shows §3.6.1, §3.6.2 and §3.6.4, each linking to that clause in the standard browser

#### Scenario: A section that owns no countable clause
- **WHEN** "Non-Goals and Exclusions" is on the Path
- **THEN** its item shows §2.1.5 marked as related, and no clause as owned

#### Scenario: Two sections citing the same clause
- **WHEN** both "Voluntary Exit" and "Forced Exit" are on the Path
- **THEN** both items show §3.6.4, owned by the first and related on the second

### Requirement: Every Path item can be started and frozen

Every Path item MUST offer a way to start a discussion that is filed against its
section, whether or not the section owns a countable clause. A discussion started
from a Path item MUST, when frozen, adopt a definition for that item's section
and no other. A section that owns no countable clause MUST still become answered
by that freeze, and its decision MUST cover no clause and change no readiness
count.

#### Scenario: Starting an item whose section owns no countable clause
- **WHEN** a member starts a discussion from "What are we deliberately not, however tempting it becomes?"
- **THEN** the discussion is filed against `purpose-charter.non-goals-and-exclusions`
- **AND** a steward freezing a proposal in it adopts a definition for that section, not for `purpose-charter.primary-purpose`
- **AND** the item leaves the Path, and the readiness count is unchanged

#### Scenario: Starting an item whose section owns clauses
- **WHEN** a member starts a discussion from "Voluntary Exit"
- **THEN** the discussion is filed against that section and against §3.6.1
- **AND** freezing it covers §3.6.1, §3.6.2 and §3.6.4

#### Scenario: A member of another community
- **WHEN** a member of community B posts a start for a section on community A's URL
- **THEN** the answer is the same as for a community that does not exist

### Requirement: An open discussion belongs to exactly the item it answers

A Path item MUST show an open discussion as its own only when that discussion
answers the item's section — named directly, or through a clause the section
owns. A discussion about a clause the section only references MUST NOT be shown
as that item's discussion.

#### Scenario: A discussion on a shared clause
- **WHEN** an open discussion answers "Voluntary Exit", and "Forced Exit" references a clause it owns
- **THEN** "Voluntary Exit" offers to open that discussion
- **AND** "Forced Exit" still offers to start its own

#### Scenario: A discussion opened before this change
- **WHEN** an open discussion was filed against §3.6.2 with no section named
- **THEN** "Voluntary Exit" offers to open it, because its section owns §3.6.2

### Requirement: A Path question covers what its section's clauses require

The question a Path item shows MUST name every obligation its section's owned
MUST clauses place on the community, in plain language, and MUST NOT ask about
an obligation another section owns. A section that owns no countable clause MUST
be asked about what its template says to define.

#### Scenario: The exit questions
- **WHEN** a member reads the Path items for the Exit Protocol
- **THEN** the "Voluntary Exit" question asks about leaving at any time without punishment or loss of other rights
- **AND** what happens to a leaving member's roles, tasks, access and held assets is asked only by "Asset, Role, and Responsibility Separation"

## ADDED Requirements

### Requirement: Each artifact has a page listing its required sections and what answers them

The system SHALL provide one page per artifact of the community's adopted
standard. The page MUST list the artifact's required sections in the standard's
order, and for each MUST show its section reference, its name, the definition
answering it in this community or that none exists yet, that definition's derived
status, and whether it is provisional. The page MUST be readable by any member
and MUST NOT be reachable for another community's artifact.

#### Scenario: A member opens an artifact
- **WHEN** a member opens the Membership Charter's page
- **THEN** every section the charter requires is listed in the standard's order
- **AND** each shows the definition answering it, or "no definition yet"

#### Scenario: A provisional answer is marked
- **WHEN** a section is answered by a provisional definition
- **THEN** its row says provisional

#### Scenario: The list links here
- **WHEN** a member follows "Open" on the Artifacts list
- **THEN** they arrive on that artifact's page, not the Standard browser

#### Scenario: Another community's artifact
- **WHEN** a member of one community requests an artifact page under another community's address
- **THEN** the response is not found

#### Scenario: An artifact key the standard does not have
- **WHEN** the page is requested for a key that is not an artifact of the adopted standard
- **THEN** the response is not found

### Requirement: Local additions are shown apart and never counted

The artifact page SHALL show the community's local definitions attached to this
artifact in a separate block, labelled as the community's own. They MUST NOT
contribute to the artifact's completeness or to any readiness or compliance
figure.

#### Scenario: A local addition is shown
- **WHEN** the community has an adopted local definition attached to this artifact
- **THEN** it appears in the local additions block, labelled local

#### Scenario: A local addition does not move completeness
- **WHEN** a local definition is added to an artifact that has 5 of 8 required sections answered
- **THEN** the page still reports 5 of 8

### Requirement: Completeness is shown as counts, never as a percentage

The artifact page SHALL state how many of its required, community-authored
sections are answered, as a count of a total, with one visual segment per
section. It MUST NOT show a percentage. The count MUST equal the one the
Artifacts list and readiness use for the same artifact.

#### Scenario: Counts are shown
- **WHEN** five of eight authored sections are answered
- **THEN** the page says 5 of 8 and shows eight segments, five filled

#### Scenario: No percentage appears
- **WHEN** the page is rendered in any state
- **THEN** no percentage sign appears in its completeness

#### Scenario: Sections the community does not write are not counted
- **WHEN** an artifact includes a section filled from a decision or kept as an instance record
- **THEN** that section is listed but not counted in the total

### Requirement: The page says what is blocking completeness

The artifact page SHALL list what stands between the artifact and complete: each
required section with no definition, each section whose definition is
provisional, and each section whose discussion has an open proposal. Each item
MUST link to the place it can be acted on. A complete artifact with no
provisional answers MUST show no blockers.

#### Scenario: Missing and provisional answers are listed
- **WHEN** one section has no definition and one is answered provisionally
- **THEN** both appear as blockers, each linking to where it is worked on

#### Scenario: A complete artifact
- **WHEN** every authored section is answered and none is provisional
- **THEN** no blockers are listed

### Requirement: The page shows publication state and history, and a steward can publish from it

The artifact page SHALL show whether the artifact is published to the world and
list its publication history — each publish and unpublish with who did it and
when — read from the change log. A steward MUST be able to publish the artifact
from the page through the same operation the publishing settings use. A member
MUST NOT be offered or permitted the publish action.

#### Scenario: History is read from the change log
- **WHEN** an artifact was published, unpublished and published again
- **THEN** all three entries are listed, newest first, each attributed

#### Scenario: A steward publishes
- **WHEN** a steward publishes the artifact from its page
- **THEN** it is published exactly as it would be from the publishing settings
- **AND** a new history entry appears

#### Scenario: A member cannot publish
- **WHEN** a member submits the publish action directly
- **THEN** it is refused and nothing is published

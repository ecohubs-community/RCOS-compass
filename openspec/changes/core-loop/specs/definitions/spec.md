## ADDED Requirements

### Requirement: A definition answers one section, or nothing at all

A definition MUST carry a scope of `standard` or `local`. A `standard` definition
MUST name exactly one section of an adopted standard, and a community MUST NOT
hold two of them for the same section. A `local` definition MUST NOT name a
section.

#### Scenario: A second definition for the same section
- **WHEN** a definition is created for a section that already has one
- **THEN** it is refused, and the existing definition is offered instead

#### Scenario: A community writes many local definitions
- **WHEN** several local definitions are created in one community
- **THEN** all are stored, because none of them names a section

#### Scenario: A local definition names a section
- **WHEN** a definition with scope `local` is given a section key
- **THEN** it is refused

### Requirement: A local definition moves no number

A local definition MUST NOT change readiness or compliance in either direction,
and MUST NOT complete or block a mandatory artifact.

#### Scenario: A local definition is adopted
- **WHEN** a community adopts a local definition
- **THEN** readiness is unchanged
- **AND** compliance is unchanged

#### Scenario: A local definition is left unwritten
- **WHEN** a community's local artifact has no definitions at all
- **THEN** no artifact is reported incomplete because of it

#### Scenario: A local definition is attached to an RCOS artifact
- **WHEN** a local definition extends an artifact the standard defines
- **THEN** it is listed under that artifact
- **AND** the artifact's completeness is computed without it

### Requirement: A frozen version stays authoritative until the next freeze

A definition version MUST be immutable once frozen. Editing a definition MUST
create a draft on top of the frozen version, and the frozen version MUST remain
the one shown and exported until a new freeze replaces it.

#### Scenario: Editing an adopted definition
- **WHEN** a member edits a definition that has an adopted version
- **THEN** a draft is created
- **AND** readers still see the adopted version

#### Scenario: A frozen version is edited directly
- **WHEN** a write is attempted against a frozen version's text
- **THEN** it is refused

### Requirement: Concurrent editing does not silently lose work

A draft MUST carry an edit token issued when it was loaded. A save presenting a
stale token MUST NOT overwrite, and MUST tell the editor who else is editing and
what changed.

#### Scenario: Two members edit the same draft
- **WHEN** the second member saves with the token they loaded
- **THEN** the save is refused
- **AND** they are shown the other editor and offered keep mine, take theirs, or merge by hand

#### Scenario: A single editor saves repeatedly
- **WHEN** the same editor autosaves several times in a row
- **THEN** every save succeeds, each with the token the previous save returned

### Requirement: A community can record what the standard should have asked

Creating a local definition MUST offer to record it as feedback on the standard,
and that record MUST NOT be sent anywhere without a deliberate act.

#### Scenario: The feedback box is ticked
- **WHEN** a local definition is created with "RCOS should require this" ticked
- **THEN** a standard-feedback entry is stored with the community's own text

#### Scenario: Nothing leaves the instance
- **WHEN** a standard-feedback entry exists
- **THEN** no request is made to any external service

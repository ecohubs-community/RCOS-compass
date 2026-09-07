## ADDED Requirements

### Requirement: A community can take everything it has and leave

A steward MUST be able to export the community as a single bundle containing
Markdown, PDF and JSON. The export MUST run as a background job and MUST NOT
block the request that asked for it.

#### Scenario: A steward requests an export
- **WHEN** a steward asks for an export
- **THEN** a job is queued and the request returns immediately
- **AND** the steward is told where the result will appear

#### Scenario: The export finishes
- **WHEN** the job completes
- **THEN** the steward is notified and a download link is available

#### Scenario: A member requests one
- **WHEN** a member without permission requests an export
- **THEN** it is refused and no job is queued

### Requirement: The bundle is readable without the application

The Markdown and JSON in an export MUST be usable with no Compass, no network
and no database: one file per artifact, the decision register in full, and a
manifest naming the standard and version the community was working against.

#### Scenario: The bundle is opened with nothing serving
- **WHEN** the bundle is unpacked and read with no Compass process running
- **THEN** the artifacts read as documents and the register reads as a table
- **AND** nothing in it requires a network request to make sense

#### Scenario: The bundle is compared with the application
- **WHEN** the bundle's decision count and adopted definitions are compared with what the register shows
- **THEN** they agree

#### Scenario: The manifest
- **WHEN** the bundle is inspected
- **THEN** it names the standard, its version, the community, the export date and what the exporter could see

### Requirement: An export carries only what its requester may see

An export MUST apply the same visibility filter as every other read path, and
MUST record which visibility levels it contained.

#### Scenario: A community with restricted content exports
- **WHEN** a steward who may not see a restricted definition exports the community
- **THEN** the bundle does not contain it

#### Scenario: The bundle says what it holds
- **WHEN** the manifest is read
- **THEN** it states which visibility levels are included

### Requirement: Local definitions are in the bundle and labelled

Local definitions and community artifacts MUST be included and MUST be labelled
as community additions rather than standard requirements.

#### Scenario: A community with local additions exports
- **WHEN** the bundle is read
- **THEN** each local item carries a label saying it is not required by the standard

#### Scenario: An outsider reads the bundle
- **WHEN** somebody unfamiliar with the community reads an exported artifact
- **THEN** they can tell a standard requirement from a community addition without knowing the product

### Requirement: One rendering, wherever an artifact is shown outwardly

The public page, the exported Markdown, the PDF and the mirrored commit MUST be
produced from one rendering of an artifact, not from separate implementations per
destination. The same facts MUST appear in each.

#### Scenario: The same artifact is read three ways
- **WHEN** an artifact is rendered for the public page, the export bundle and the mirror
- **THEN** its adopted definitions, its local additions and their labels are the same in all three

#### Scenario: A rendering rule changes
- **WHEN** how an artifact presents a local addition changes
- **THEN** it changes in all three, because there is one place it is decided

### Requirement: A download link is signed, short-lived and audited

An export MUST be downloadable through a signed link that expires, is scoped to
one community, and is audit-logged both when issued and when used.

#### Scenario: A link is used within its lifetime
- **WHEN** the link is opened before it expires
- **THEN** the bundle downloads and the access is audit-logged

#### Scenario: A link is used after it expires
- **WHEN** the link is opened after expiry
- **THEN** it is refused

#### Scenario: A link is altered
- **WHEN** any part of a signed link is changed
- **THEN** it is refused

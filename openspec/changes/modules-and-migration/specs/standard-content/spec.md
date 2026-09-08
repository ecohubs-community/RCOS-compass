## MODIFIED Requirements

### Requirement: The loader supports many standards and versions

The loader MUST address content by `(standard_id, version)` and MUST NOT assume a
single standard or a single version, so that modules and a future core version
need content and screens rather than a schema migration.

It MUST be able to enumerate the standards and versions available to it, because
a community choosing a module or considering a version cannot be offered a list
the loader cannot produce. It MUST also be able to hold two versions of the same
standard at once, addressed by where they were loaded from, which is what a
migration preview compares.

#### Scenario: A second standard is present
- **WHEN** content for another standard id exists alongside core
- **THEN** both load, and each is queried independently

#### Scenario: An unknown standard or version is requested
- **WHEN** content is requested for a standard or version that is not present
- **THEN** the loader reports it clearly rather than returning an empty standard

#### Scenario: Content is read repeatedly
- **WHEN** the same standard is requested many times
- **THEN** it is parsed once and served from cache

#### Scenario: What is available
- **WHEN** the catalogue is asked what exists
- **THEN** it lists each standard and version present, with its kind

#### Scenario: Two versions at once
- **WHEN** two versions of one standard are loaded from different roots
- **THEN** both are held, and neither is returned in place of the other

## ADDED Requirements

### Requirement: A version that supersedes another ships its migration map

Content for a version that supersedes another MUST include a migration map beside
it, and the map MUST be part of what the vendored-content check verifies. A
version present without one MUST be reported rather than silently unmigratable.

#### Scenario: A superseding version arrives
- **WHEN** content for a newer version is vendored
- **THEN** its migration map is present and checked with the rest of the content

#### Scenario: A version with no map
- **WHEN** a superseding version is present without one
- **THEN** the check reports it

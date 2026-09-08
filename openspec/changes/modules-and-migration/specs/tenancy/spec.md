## ADDED Requirements

### Requirement: A community holds one core standard and any number of modules

A community MUST have exactly one active standard of kind core, and MAY have any
number of active modules. Every active standard MUST record the decision that
adopted it. Retired standards MUST remain, so that a community that has migrated
keeps the version it used to be on.

#### Scenario: A community is created
- **WHEN** it is created
- **THEN** it has one active core standard

#### Scenario: A second active core
- **WHEN** anything tries to make a second core standard active for one community
- **THEN** it is refused

#### Scenario: After a migration
- **WHEN** a community has migrated
- **THEN** the old version remains as retired beside the new active one

#### Scenario: After two migrations
- **WHEN** a community has migrated twice
- **THEN** both older versions remain retired, and exactly one is active

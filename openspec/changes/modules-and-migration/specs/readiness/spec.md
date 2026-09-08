## ADDED Requirements

### Requirement: Figures are per adopted standard, and a migrating community has two

Readiness and completeness MUST be computed for a specific adopted standard, and
MUST NOT be combined across standards. A community with a migration in flight
MUST be able to see the figure under the version in force and the figure under the
version it is considering, at the same time and labelled.

#### Scenario: A community with a module
- **WHEN** readiness is read
- **THEN** the core figure and the module figure are separate, each labelled

#### Scenario: A community mid-migration
- **WHEN** the dashboard is read while a migration is in flight
- **THEN** both figures appear, each naming its version

#### Scenario: The figures are never added
- **WHEN** any surface shows readiness for a community with more than one standard
- **THEN** no combined figure is shown anywhere

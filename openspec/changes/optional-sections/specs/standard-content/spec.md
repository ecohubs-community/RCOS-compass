## ADDED Requirements

### Requirement: An optional section is written but never required

The loaded standard MUST expose, for every section, whether it is optional, and
MUST expose the required sections — authored and not optional — separately from
the authored ones. An optional section MUST be writable wherever an authored
section is, and MUST NOT be counted toward artifact completeness, the outward
claim, the self-audit, the Path, or the choice of a Ratification Record's
decision. Only an authored section MAY be optional, and an optional section
MUST NOT own a MUST clause; `check:standard` MUST fail otherwise.

#### Scenario: Non-Goals in RCOS-Core 0.1
- **WHEN** the vendored RCOS-Core 0.1 is loaded
- **THEN** `purpose-charter.non-goals-and-exclusions` is the only optional section
- **AND** it is among the Purpose Charter's authored sections but not its required ones

#### Scenario: An optional section owning a MUST clause
- **WHEN** `purpose-charter.secondary-purposes`, which owns the MUST clause 2.1.4, is marked optional in `sections.yaml`
- **THEN** `pnpm check:standard` fails, naming the section and the clause

#### Scenario: An optional section on the Path
- **WHEN** a member opens the Path and Non-Goals is unanswered
- **THEN** no Path item is Non-Goals
- **AND** the section can still be discussed, frozen and adopted from its artifact

## MODIFIED Requirements

### Requirement: Completeness counts only the sections a community writes

The loaded standard MUST expose the authored sections separately from all
sections, and the required sections separately from the authored ones, so
artifact completeness is computed over what a community is actually asked for.

#### Scenario: The authored set is requested
- **WHEN** the loaded standard is asked for its authored sections
- **THEN** every returned section is `authored`
- **AND** no Ratification Record, derived view or specimen entry is included

#### Scenario: The required set is requested
- **WHEN** the loaded standard is asked for its required sections
- **THEN** every returned section is `authored` and not optional

#### Scenario: An artifact's outstanding work is listed
- **WHEN** the unanswered sections of a mandatory artifact are listed
- **THEN** no section the platform fills or generates appears among them
- **AND** no optional section appears among them

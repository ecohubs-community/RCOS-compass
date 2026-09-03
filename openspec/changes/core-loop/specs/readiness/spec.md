## ADDED Requirements

### Requirement: Readiness counts answerable MUST clauses and nothing else

Readiness MUST be the proportion of countable clauses that are satisfied, where a
countable clause is a MUST clause the standard says is answered by a section.
Clauses the standard marks as satisfied by the platform or as not a definition
MUST be excluded from both the numerator and the denominator, and the denominator
MUST be computed from the loaded standard rather than written down.

#### Scenario: A community answers a clause
- **WHEN** a definition owning a countable clause gains an adopted version
- **THEN** readiness rises by exactly one clause's worth

#### Scenario: A non-countable clause is examined
- **WHEN** readiness is computed
- **THEN** clauses dispositioned satisfied-by-platform or not-a-definition appear in neither part of the fraction

#### Scenario: A community answers everything answerable
- **WHEN** every countable clause is satisfied
- **THEN** readiness is 100%

#### Scenario: A definition is past its review date
- **WHEN** an adopted definition's review date has passed
- **THEN** it still counts as satisfied
- **AND** it is reported as needing review

### Requirement: An artifact is complete when its authored sections are answered

Artifact completeness MUST count only sections the standard marks as authored, and
MUST ignore local definitions attached to the artifact.

#### Scenario: Every authored section is answered
- **WHEN** each authored section of an artifact has an adopted definition
- **THEN** the artifact is complete

#### Scenario: An artifact carries local additions
- **WHEN** local definitions are attached to a complete artifact
- **THEN** it stays complete

#### Scenario: One authored section is missing
- **WHEN** a single authored section has no adopted definition
- **THEN** the artifact is incomplete, and the missing section is named

### Requirement: The outward claim is binary and the inward number is not

Compliance MUST be a yes or no over the mandatory artifacts of the core standard,
MUST be false while any MUST-satisfying definition is provisional, and MUST NOT be
expressed as a percentage anywhere it is shown outside the community.

#### Scenario: Most artifacts complete
- **WHEN** a community has completed most but not all mandatory artifacts
- **THEN** compliance is false, and the incomplete artifacts are named

#### Scenario: All artifacts complete but a definition is provisional
- **WHEN** every mandatory artifact is complete and one adopted definition is provisional
- **THEN** compliance is false

#### Scenario: A module is complete and the core is not
- **WHEN** an adopted module reaches 100% while core artifacts are missing
- **THEN** the community still reads as not yet core-compliant
- **AND** the module's figure is never added to the core figure

### Requirement: Numbers are computed, never stored

Readiness and compliance MUST be computed from the current rows on each read, and
MUST NOT be persisted in a column that could disagree with them.

#### Scenario: A definition is adopted
- **WHEN** readiness is read immediately afterwards
- **THEN** it reflects the new adoption with no recomputation step to run

#### Scenario: A membership changes
- **WHEN** anything unrelated to definitions changes
- **THEN** readiness is unchanged

## MODIFIED Requirements

### Requirement: An artifact is complete when its authored sections are answered

Artifact completeness MUST count only sections the standard marks as authored
and not optional, and MUST ignore local definitions attached to the artifact and
any optional section, answered or not.

#### Scenario: Every authored section is answered
- **WHEN** each required authored section of an artifact has an adopted definition
- **THEN** the artifact is complete

#### Scenario: An artifact carries local additions
- **WHEN** local definitions are attached to a complete artifact
- **THEN** it stays complete

#### Scenario: One authored section is missing
- **WHEN** a single required authored section has no adopted definition
- **THEN** the artifact is incomplete, and the missing section is named

#### Scenario: An optional section is left out
- **WHEN** every required section of every mandatory artifact is adopted and the Purpose Charter's Non-Goals is not
- **THEN** the Purpose Charter is complete
- **AND** the outward claim is compliant

#### Scenario: An optional section is adopted
- **WHEN** a community adopts Non-Goals and nothing else
- **THEN** the Purpose Charter's count of answered sections does not move

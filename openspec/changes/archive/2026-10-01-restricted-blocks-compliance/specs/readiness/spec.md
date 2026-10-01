## MODIFIED Requirements

### Requirement: The outward claim is binary and the inward number is not

Compliance MUST be a yes or no over the mandatory artifacts of the core standard,
MUST be false while any MUST-satisfying definition is provisional, MUST be false
while any adopted definition answering a layer whose artifact rule allows no
exception to member access is restricted, and MUST NOT be expressed as a
percentage anywhere it is shown outside the community.

The two MUST be separate shapes rather than one shape read carefully: the inward
figure carries the percentage and the per-layer breakdown, and the outward claim
carries the yes-or-no, the list of what is missing, the standard's version and
the date of the last self-audit. A surface that may only reach the outward shape
MUST NOT be able to render the inward one. The outward claim MUST count
restricted definitions without naming them.

#### Scenario: Most artifacts complete
- **WHEN** a community has completed most but not all mandatory artifacts
- **THEN** compliance is false, and the incomplete artifacts are named

#### Scenario: All artifacts complete but a definition is provisional
- **WHEN** every mandatory artifact is complete and one adopted definition is provisional
- **THEN** compliance is false

#### Scenario: All artifacts complete but a Layer 0 definition is restricted
- **WHEN** every mandatory artifact is complete, nothing is provisional, and an adopted Purpose Charter definition is restricted
- **THEN** compliance is false in `compliance()`, the outward claim and the self-audit
- **AND** the public page says one rule every member must be able to read is restricted, without naming it

#### Scenario: A Layer 3 definition is restricted under an exception
- **WHEN** every mandatory artifact is complete, nothing is provisional, and an adopted Treasury Ruleset definition is restricted under a live transparency exception
- **THEN** compliance is true

#### Scenario: A module is complete and the core is not
- **WHEN** an adopted module reaches 100% while core artifacts are missing
- **THEN** the community still reads as not yet core-compliant
- **AND** the module's figure is never added to the core figure

#### Scenario: The claim is asked for outwardly
- **WHEN** the outward claim is built for a public surface or an export
- **THEN** it contains the binary state, the gap list, the standard's version and the last self-audit date
- **AND** it contains no percentage and no per-layer figure

#### Scenario: A percentage is added to an outward shape
- **WHEN** a readiness figure is placed on anything a public surface renders
- **THEN** the public-surface test fails

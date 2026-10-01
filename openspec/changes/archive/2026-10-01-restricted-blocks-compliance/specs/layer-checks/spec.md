## MODIFIED Requirements

### Requirement: The checks inform and do not decide compliance

The checks MUST NOT change whether the community is compliant, with one
exception: a restricted adopted definition in a layer whose artifact rule allows
no exception to member access MUST make the community not compliant. The page
MUST say that compliance requires every mandatory artifact to be complete, no
definition to be provisional, and nothing in Layers 0–2 to be restricted.

#### Scenario: A restricted Layer 0 definition
- **WHEN** Layer 0's accessibility check reads "not met" and every mandatory artifact is complete with nothing provisional
- **THEN** the community is not compliant

#### Scenario: A Layer 1 definition with open linter findings
- **WHEN** Layer 1's explicitness check lists a definition with open linter findings
- **THEN** the community's compliance is what it would be without the check

#### Scenario: Another community's data
- **WHEN** community B has a restricted Layer 0 definition
- **THEN** community A's checks are not affected

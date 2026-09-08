## ADDED Requirements

### Requirement: A bundle carries no erased person's name

An export MUST render an erased person the same way every other surface does, and
MUST NOT contain their name or address anywhere — in an artifact, in the decision
register, in the manifest or in the readme.

#### Scenario: A community exports after an erasure
- **WHEN** a bundle is produced for a community where somebody has been erased
- **THEN** no file in it contains that person's name or address

#### Scenario: The decision register in the bundle
- **WHEN** the register names attendance
- **THEN** the erased person appears as a former member and the tally is unchanged

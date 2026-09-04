## ADDED Requirements

### Requirement: A community is created with somewhere to put its own agreements

Creating a community MUST also create a local artifact for the community's own
agreements, in the same transaction, so a community never has to build a
container before writing its first rule.

#### Scenario: A tenant is created
- **WHEN** a community is created
- **THEN** it has a local artifact ready to hold definitions

#### Scenario: The creating transaction fails
- **WHEN** community creation fails after the community row is prepared
- **THEN** neither the community nor the local artifact exists

#### Scenario: Another community requests it
- **WHEN** a member of a different community requests that artifact by id
- **THEN** the answer is the same as for one that does not exist

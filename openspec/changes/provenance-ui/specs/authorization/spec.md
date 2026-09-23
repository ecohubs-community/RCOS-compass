## ADDED Requirements

### Requirement: Asking and creating are member acts; answering and resolving are steward acts

The capability matrix SHALL grant asking for the question to be moved back and
creating a local definition to members and stewards; and SHALL grant answering a
move request, setting a round's closing time, recording the interim adoption
rule and resolving another person's objection to stewards only. The interface
MUST offer each action only to those holding its capability, from props derived
from the matrix, and the server MUST refuse it to anyone else.

#### Scenario: A member asks and creates
- **WHEN** a member asks for a move and creates a local definition
- **THEN** both are permitted

#### Scenario: A member answers a request
- **WHEN** a member submits a grant or decline directly
- **THEN** it is refused

#### Scenario: A member resolves someone else's objection
- **WHEN** a member submits a resolution for another member's objection
- **THEN** it is refused

#### Scenario: The resolve control follows the right capability
- **WHEN** a role holds the capability to resolve objections but not to freeze
- **THEN** the resolve control is offered to it

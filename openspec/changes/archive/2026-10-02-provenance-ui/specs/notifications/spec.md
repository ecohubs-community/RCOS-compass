## ADDED Requirements

### Requirement: Stewards are told when a member asks to move the question back

Every current steward of the community SHALL be notified, except the requester,
when a member asks for the question to be moved back. The notification MUST link
to the request in the thread. When the request is granted, declined or lapses,
the requester MUST be notified of the outcome. No one outside the community MUST
be notified.

#### Scenario: A member asks
- **WHEN** a member asks to put v3 back
- **THEN** each steward receives a notification linking to the request

#### Scenario: A steward asks
- **WHEN** a steward asks
- **THEN** the other stewards are notified and the asking steward is not

#### Scenario: The request is answered
- **WHEN** a steward declines the request
- **THEN** the requester is notified that it was declined, with a link to the note

#### Scenario: A former steward
- **WHEN** someone who was a steward has left the community
- **THEN** they are not notified

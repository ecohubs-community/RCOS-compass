## ADDED Requirements

### Requirement: Erasure removes a person's open join requests

Erasing a person MUST delete every join request of theirs that has not been
decided, in the same transaction as the rest of the erasure. Other people's
requests MUST be untouched.

#### Scenario: A person with an open request is erased
- **WHEN** a person who has asked to join a community is erased
- **THEN** that community's stewards no longer see the request

#### Scenario: Someone else's request
- **WHEN** one requester is erased while another person's request to the same community is open
- **THEN** the other request is still listed

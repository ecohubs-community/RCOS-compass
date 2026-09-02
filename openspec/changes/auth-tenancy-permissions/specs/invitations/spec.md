## ADDED Requirements

### Requirement: An invitation is single-use and bound to its address

An invitation MUST be consumable exactly once, by the address it was sent to, and
MUST expire. Tokens MUST be stored hashed.

#### Scenario: An invitation is accepted
- **WHEN** the invited person follows a valid invitation and signs in with that address
- **THEN** a membership is created with the invited role
- **AND** the invitation is marked accepted

#### Scenario: The same invitation is used twice
- **WHEN** an already-accepted invitation is presented again
- **THEN** it is refused, and no second membership is created

#### Scenario: A different address accepts
- **WHEN** someone signed in with a different address presents the invitation
- **THEN** it is refused

#### Scenario: An expired invitation
- **WHEN** an invitation older than its expiry is presented
- **THEN** it is refused, and the refusal explains that it has expired

#### Scenario: The database is read directly
- **WHEN** the invitation table is inspected
- **THEN** the raw token does not appear in it

### Requirement: Acceptance is atomic

Creating the membership and consuming the invitation MUST happen in one
transaction.

#### Scenario: Two acceptances race
- **WHEN** the same invitation is accepted twice concurrently
- **THEN** exactly one membership exists afterwards

#### Scenario: Membership creation fails
- **WHEN** the membership cannot be created
- **THEN** the invitation remains unaccepted and can be retried

### Requirement: Invitation mail carries a link, not content

Mail sent by the application MUST NOT contain community content.

#### Scenario: An invitation is sent
- **WHEN** an invitation email is generated
- **THEN** it contains the community name and a link
- **AND** it contains no definition, discussion, or decision text

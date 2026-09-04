## ADDED Requirements

### Requirement: Notifications are written with the act that caused them

Notification rows MUST be written inside the transaction that caused them, and
sending mail MUST NOT happen during that transaction.

#### Scenario: A decision is frozen
- **WHEN** the freeze transaction commits
- **THEN** every recipient's notification exists
- **AND** no mail was sent during it

#### Scenario: The transaction rolls back
- **WHEN** a freeze fails
- **THEN** no notification about it exists

### Requirement: A member is told what happened where they can act on it

The application MUST record a notification for each recipient of an event that
concerns them — a proposal in a discussion they joined, a consent round opened, a
decision frozen, a review date reached — and MUST show them in the application.

#### Scenario: A proposal is posted
- **WHEN** a member posts a proposal in a discussion others have joined
- **THEN** each of those members has a notification

#### Scenario: The author of the event
- **WHEN** a member performs the action themselves
- **THEN** they receive no notification for their own act

#### Scenario: Notifications are per community
- **WHEN** a member belongs to two communities
- **THEN** each notification names the community it came from, and none crosses between them

### Requirement: A member who has left is told nothing

Notifications MUST NOT be created for a person whose membership has ended, and
existing ones MUST NOT be readable after a membership ends.

#### Scenario: A member is removed
- **WHEN** a member's membership ends and an event then occurs
- **THEN** they receive no notification

#### Scenario: A former member requests their list
- **WHEN** they request notifications for that community
- **THEN** the answer is the same as for a community that does not exist

### Requirement: The weekly digest carries a link and no content

The digest MUST be sent by a job rather than during a request, MUST summarise
counts and titles only, and MUST contain no definition text, discussion text, or
decision rationale.

#### Scenario: A digest is sent
- **WHEN** the weekly digest job runs for a community with activity
- **THEN** one message per member is sent, carrying counts and a link

#### Scenario: The body is inspected
- **WHEN** a digest body is searched for definition or discussion text
- **THEN** none appears

#### Scenario: A week with nothing in it
- **WHEN** the job runs for a community with no activity
- **THEN** no message is sent

#### Scenario: Freezing sends no mail
- **WHEN** a decision is frozen
- **THEN** its notification rows are written in the same transaction
- **AND** no message is sent, because mail is the digest's work and nothing that
  slow may hold the write lock a freeze holds

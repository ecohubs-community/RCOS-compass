## ADDED Requirements

### Requirement: An unhandled error is recorded on this instance, scrubbed

An unhandled server error MUST be recorded with its fingerprint, a scrubbed
message, the route, the request id and the community where there is one. The
record MUST NOT contain a definition body, discussion text, document content,
a credential or a personal name, and MUST go through the same scrubbing rules as
the logs rather than a second copy of them.

Recording an error MUST NOT change what the visitor sees.

#### Scenario: A route throws
- **WHEN** an unhandled error occurs in a request
- **THEN** a record is written with the route, the request id and the scrubbed message
- **AND** the visitor still receives the generic error page with its request id

#### Scenario: The error carries content
- **WHEN** the error message contains text a member wrote
- **THEN** the stored record does not contain it

#### Scenario: Recording fails
- **WHEN** writing the record fails
- **THEN** the request still returns its response

### Requirement: Repeated errors are one entry, counted

Errors with the same fingerprint MUST be stored as one row carrying a count, a
first-seen and a last-seen time, rather than one row per occurrence. Records MUST
be removed after a stated retention period.

#### Scenario: One broken route, many requests
- **WHEN** the same error occurs four hundred times
- **THEN** the status page shows one entry with a count of four hundred

#### Scenario: Two different errors
- **WHEN** two errors with different fingerprints occur
- **THEN** they are separate entries

#### Scenario: Old records
- **WHEN** the cleanup runs after the retention period
- **THEN** records older than it are gone

### Requirement: Onboarding is counted per community, and never per person

The instance MUST record whether a community has reached each of a fixed set of
onboarding milestones. Each milestone MUST be recorded at most once per
community, MUST carry no member identity, no page path and no session, and MUST
be written inside the transaction that makes it true.

Counting MUST be switchable off by configuration for a self-hosted instance.

#### Scenario: A community adopts its first definition
- **WHEN** the first definition is adopted
- **THEN** the milestone is recorded once for that community

#### Scenario: The same milestone happens again
- **WHEN** a second definition is adopted
- **THEN** no second record is written

#### Scenario: What a record contains
- **WHEN** a milestone record is read
- **THEN** it holds the community, the milestone and the time, and nothing identifying a member

#### Scenario: Counting is switched off
- **WHEN** the instance is configured with product analytics off
- **THEN** no milestone is written and every other behaviour is unchanged

### Requirement: A failed mail send is recorded without keeping the address

A message that fails to send MUST be recorded with its kind, the community, what
it was for and the error. The record MUST NOT contain the recipient's address.

#### Scenario: An invitation fails to send
- **WHEN** the transport rejects it
- **THEN** a record names the message kind, the community and the invitation, and the error

#### Scenario: What the record does not hold
- **WHEN** the record is read
- **THEN** it contains no email address

#### Scenario: Mail is not configured at all
- **WHEN** no transport is configured and a send is attempted
- **THEN** the caller is told, as it is today, and the failure is recorded

### Requirement: One page answers "is anything broken right now"

The instance status page MUST show the build, the migration state, database size,
tenant counts, queue depth by kind, dead jobs, recent error entries, mail
delivery failures, AI usage for the current month across tenants, and how many
communities have reached each onboarding milestone.

AI usage MUST be reported as calls and tokens. A monetary figure MUST NOT be
shown unless a price list is configured, because a cost computed from a price
nobody maintains is worse than a count.

It MUST show counts and sizes only: no job payload, no definition, decision or
document content, and no member identity.

#### Scenario: An operator opens the status page
- **WHEN** a platform admin opens it
- **THEN** it shows the queue, the dead jobs, recent errors, mail failures, AI usage and the funnel

#### Scenario: No price list is configured
- **WHEN** AI usage is shown with no price list
- **THEN** calls and tokens are shown and no monetary figure is

#### Scenario: Nothing is wrong
- **WHEN** there are no dead jobs and no errors
- **THEN** the page says so rather than showing empty tables with no explanation

#### Scenario: A job payload
- **WHEN** a dead job is shown
- **THEN** its kind, attempts and error are shown and its payload is not

#### Scenario: A non-admin requests it
- **WHEN** anybody who is not a platform admin requests the status page
- **THEN** the response is 404

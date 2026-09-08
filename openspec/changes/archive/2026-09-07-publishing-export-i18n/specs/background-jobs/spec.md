## ADDED Requirements

### Requirement: A job may produce a downloadable result

A job that produces a file MUST store it where a later request can find it, MUST
record when it expires, and MUST clean it up afterwards. The queue MUST NOT be
the place a file lives indefinitely.

#### Scenario: An export job completes
- **WHEN** the job finishes
- **THEN** the bundle is stored, its expiry recorded, and the requester notified

#### Scenario: A produced file expires
- **WHEN** the expiry passes
- **THEN** the file is removed and the link stops working

#### Scenario: A job producing a file fails part-way
- **WHEN** it fails
- **THEN** no partial file is left behind and no link is issued

### Requirement: A job may hold a credential, and must not leak it

A job that authenticates to a third party MUST read its credential from encrypted
storage at the moment it runs, MUST NOT write it to the job record, and MUST NOT
include it in a log line, a retry record or a dead-letter entry.

#### Scenario: A mirror push job runs
- **WHEN** the job authenticates to a remote
- **THEN** the credential is not present in the job row, the logs or the retry state

#### Scenario: A push job dead-letters
- **WHEN** retries are exhausted and the job is dead-lettered
- **THEN** the dead-letter record says what failed and contains no credential

### Requirement: A scheduled job may revert state it did not create

A recurring job MUST be able to change subject state where a stated deadline has
passed, and MUST record each change in the community's change log.

#### Scenario: Transparency exceptions expire
- **WHEN** the expiry job runs and an exception's date has passed
- **THEN** the subject reverts to member-visible and a change-log entry is written

#### Scenario: Nothing has expired
- **WHEN** the job runs with no expired exceptions
- **THEN** nothing changes and nothing is logged

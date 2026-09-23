# background-jobs Specification

## Purpose
Covers work that cannot run inside a request — document extraction, git mirror pushes, export generation and expiry sweeps: a durable job row worked by an in-process worker and delivered at least once, so every handler is idempotent; retries with exponential backoff that end in a dead letter an operator can see; jobs enqueued only after the transaction that scheduled them commits, so a failure never rolls back or blocks the decision behind it; produced files that are stored, expire and are cleaned up; credentials read from encrypted storage at run time and never written to a job row, a log or a dead letter; and scheduled sweeps that revert state only where a stated deadline has passed, each change recorded in the community's change log.
## Requirements
### Requirement: Background work runs through a durable job queue

Work that cannot run inside a request MUST be enqueued as a durable row and
executed by an in-process worker: document extraction, git mirror pushes, export
generation, and expiry sweeps. Delivery is at-least-once, so every handler MUST
be idempotent.

#### Scenario: A job is enqueued and runs
- **WHEN** a job is enqueued with a `run_after` in the past
- **THEN** the worker claims it, runs it, and marks it done
- **AND** the enqueueing request returns without waiting for it

#### Scenario: The process restarts mid-job
- **WHEN** the process stops while a job is claimed
- **THEN** the claim expires after its visibility timeout
- **AND** the job is claimed again by the next worker

#### Scenario: A job is claimed twice
- **WHEN** a job's visibility timeout expires and it runs a second time
- **THEN** the observable result is the same as running it once

### Requirement: Failures retry with backoff and end in a dead letter

A failing job MUST be retried with exponentially increasing delay, and after a
bounded number of attempts MUST move to a dead-letter state where it is visible
to an operator rather than retried forever.

#### Scenario: A job throws
- **WHEN** a handler throws
- **THEN** the job is retried with exponentially increasing delay
- **AND** the error message is recorded on the row

#### Scenario: A job exhausts its attempts
- **WHEN** a job fails 5 times
- **THEN** it moves to a dead-letter state and is not retried automatically
- **AND** it is visible with its last error on the instance status page

#### Scenario: A job runs longer than its timeout
- **WHEN** a handler exceeds its declared wall-clock limit
- **THEN** it is abandoned, recorded as failed, and retried under the same rules

### Requirement: A failing job never damages the work that scheduled it

A job MUST be enqueued after its scheduling transaction has committed, and its
failure MUST NOT roll back, block, or alter that committed work.

#### Scenario: A post-commit job fails
- **WHEN** a job enqueued after a committed transaction fails every attempt
- **THEN** the committed data is unchanged
- **AND** the failure is surfaced without rolling anything back

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

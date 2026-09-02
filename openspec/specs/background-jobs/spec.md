# background-jobs Specification

## Purpose
TBD - created by archiving change scaffold-project. Update Purpose after archive.
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


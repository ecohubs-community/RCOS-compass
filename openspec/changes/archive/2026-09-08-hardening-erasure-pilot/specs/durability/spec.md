## ADDED Requirements

### Requirement: A snapshot contains the database and the uploads together

A snapshot MUST capture the database and the uploaded files as one set. A
snapshot of the database alone MUST NOT be treated as a backup, because a restore
that returns decisions without the documents they were mapped from is a broken
restore.

The snapshot MUST be takeable while the instance is serving.

#### Scenario: A snapshot is taken
- **WHEN** the snapshot command runs against a live instance
- **THEN** it produces one set containing a consistent database copy and the upload tree

#### Scenario: The instance is serving during the snapshot
- **WHEN** requests are handled while it runs
- **THEN** the snapshot completes and the instance keeps serving

### Requirement: A restore is executable, and refuses to run over a live instance

Restoring MUST be a command that puts back the database and the uploads from one
snapshot. It MUST refuse to run against a database an instance currently has
open, and say why.

#### Scenario: A restore into a stopped instance
- **WHEN** the restore command runs with the instance stopped
- **THEN** the database and the uploads are put back

#### Scenario: A restore against a running instance
- **WHEN** the command runs while an instance holds the database open
- **THEN** it refuses and says the instance must be stopped first

#### Scenario: An incomplete snapshot
- **WHEN** the snapshot directory is missing either half
- **THEN** the restore refuses rather than restoring half of it

### Requirement: The drill runs in the test suite, not in a runbook

The suite MUST contain a drill that snapshots a community with a document and a
mapped passage, restores it into a scratch location, and reads the passage and
its file back from the restored copy.

#### Scenario: The drill runs
- **WHEN** the suite runs
- **THEN** a snapshot is taken, restored elsewhere, and the mapped passage and its file are readable from the restored copy

#### Scenario: The uploads are left out of the snapshot
- **WHEN** the snapshot omits the upload tree
- **THEN** the drill fails

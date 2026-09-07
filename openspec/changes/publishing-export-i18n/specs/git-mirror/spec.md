## ADDED Requirements

### Requirement: Every community gets verifiable history, with no configuration

A community MUST have a git repository of its adopted artifacts and decision
records without configuring anything. A steward MUST be able to download it as a
git bundle at any time.

#### Scenario: A community that has configured nothing freezes a decision
- **WHEN** a freeze completes
- **THEN** a commit is added to the community's repository containing the rendered artifact and the decision record

#### Scenario: A steward downloads the history
- **WHEN** a steward asks for the repository
- **THEN** they receive a git bundle that clones and shows one commit per decision

#### Scenario: The bundle is opened without the application
- **WHEN** the bundle is cloned on a machine that has never run Compass
- **THEN** the history is readable with git alone, and the artifacts read as documents

### Requirement: The mirror runs after the freeze, never inside it

Committing MUST happen in a background job after the freeze transaction commits.
A failing mirror MUST NOT block, delay or roll back governance.

#### Scenario: The mirror fails
- **WHEN** the commit or the push fails
- **THEN** the decision is still frozen, visible and findable
- **AND** the failure is retried with backoff

#### Scenario: The failure persists
- **WHEN** retries are exhausted
- **THEN** the failure is surfaced in the community's settings, saying what failed and when

### Requirement: A community may link its own remote, and need not

A community MUST be able to add a git remote of any provider and have the same
commits pushed there. Linking MUST change where history is copied to and nothing
about what is in it.

#### Scenario: A community links a remote
- **WHEN** a steward adds a remote and a credential
- **THEN** subsequent commits are pushed there, and the local repository still holds them

#### Scenario: A community never links one
- **WHEN** no remote is configured
- **THEN** commits still happen and the bundle is still downloadable

#### Scenario: A community unlinks its remote
- **WHEN** a steward removes the remote
- **THEN** pushing stops and every commit made so far remains

### Requirement: The credential is write-only and encrypted at rest

A remote's credential MUST be encrypted with a key held in configuration, MUST
NOT be readable back through any interface, and MUST NOT appear in a log line, an
error message, an export, a push failure report or the admin console.

#### Scenario: A steward returns to the settings screen
- **WHEN** a credential has been saved and the screen is reopened
- **THEN** it shows that one is set and does not show its value

#### Scenario: A push fails with an authentication error
- **WHEN** the remote rejects the credential
- **THEN** the reported failure says authentication failed and contains no part of the credential

#### Scenario: The database is read directly
- **WHEN** the stored row is inspected without the configuration key
- **THEN** the credential is not recoverable from it

#### Scenario: A steward revokes it
- **WHEN** the credential row is deleted
- **THEN** pushing stops and the history is untouched

### Requirement: The mirror is an outward path and obeys visibility

What is committed MUST pass the same visibility filter as any other outward path.
Restricted content MUST be excluded unless the community has explicitly opted in.

#### Scenario: A community with a restricted definition mirrors
- **WHEN** commits are made
- **THEN** the restricted definition is not in them

#### Scenario: A community opts in to mirroring restricted content
- **WHEN** a steward turns that on explicitly
- **THEN** restricted content is included from that point

#### Scenario: A remote is public
- **WHEN** a community pushes to a public repository
- **THEN** what arrives there is what the community published or chose to mirror, and nothing else

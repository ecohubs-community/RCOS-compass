## ADDED Requirements

### Requirement: A discussion names the version it is currently asking about

A discussion MUST record which proposal version the community is currently being
asked about, and MUST NOT derive it from which version is newest. A discussion
with no proposal MUST name none.

Posting a new version MUST make that version the current one. Existing
discussions MUST be read as asking about their highest-numbered proposal, so
that naming the version changes no thread's meaning.

#### Scenario: The first proposal
- **WHEN** a member posts v1 in a thread that had none
- **THEN** the discussion names v1 as the version it is asking about

#### Scenario: A revision moves the question
- **WHEN** a member posts v4 while v3 is current
- **THEN** the discussion names v4, and v3 becomes a version the community has moved past

#### Scenario: A thread with no proposal
- **WHEN** a thread has only messages
- **THEN** it names no version, and there is nothing to respond to

### Requirement: A steward may move the question back to an earlier version

Moving the question to a version other than the newest MUST be available to a
steward and MUST NOT be available to a member, because it decides what the
community is being asked.

The target MUST be a proposal in that discussion. Moving MUST record a post in
the thread naming who moved it and which version it moved from and to, and MUST
carry their reason where one was given. A version the community has moved past
MUST stay readable.

Moving MUST NOT change any decision already recorded, and MUST NOT prevent a
later version from being frozen.

#### Scenario: A steward puts an earlier version back
- **WHEN** a steward makes v3 current while v4 is on the table
- **THEN** v3 is the version that takes responses
- **AND** the thread carries a post saying the steward moved the question from v4 to v3

#### Scenario: A member tries
- **WHEN** a member with no steward permission tries to move the question
- **THEN** it is refused, and the current version is unchanged

#### Scenario: Another community's version
- **WHEN** the target is a proposal in a discussion belonging to another community
- **THEN** it is refused as not found, and nothing is recorded

#### Scenario: Not a proposal
- **WHEN** the target is an ordinary message in the same thread
- **THEN** it is refused, and the current version is unchanged

#### Scenario: Already current
- **WHEN** a steward makes current the version that already is
- **THEN** nothing changes and no post is written

#### Scenario: A frozen version is put back
- **WHEN** a steward makes current a version that a decision already adopted
- **THEN** it becomes the version that takes responses
- **AND** the decision that adopted it is unchanged

#### Scenario: Moving forward again
- **WHEN** a steward makes v4 current after having moved the question to v3
- **THEN** v4 takes responses again, and the thread carries both moves

### Requirement: The rail says which version is being asked about

The version list MUST distinguish the version the community is currently being
asked about from versions that merely exist, and MUST NOT present the newest
version as the question when it is not.

A version that is neither current nor frozen MUST read as a draft. The control
that moves the question MUST appear only where moving it is possible, and only
for somebody who may.

#### Scenario: A later draft exists
- **WHEN** v4 exists and v3 is current
- **THEN** v3 is marked as the question and v4 reads as a draft
- **AND** the response form is on v3

#### Scenario: A member reads the same screen
- **WHEN** a member with no steward permission opens a thread where v3 is current and v4 exists
- **THEN** they see which version is the question
- **AND** they are offered no control to move it

#### Scenario: Nothing to move
- **WHEN** the current version is the only proposal in the thread
- **THEN** no control to move the question is offered

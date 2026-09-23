## MODIFIED Requirements

### Requirement: One version is selected, and the whole proposal panel follows it

A discussion MUST let a reader select any proposal version the thread has
produced. The proposal text, the responses, the linter result and the freeze MUST
all show that version and no other.

The selection MUST be addressable, so that a link to a version opens on it and
the panel works without JavaScript. With no selection given, the version the
discussion is currently asking about MUST be selected — not the most recent,
which is the same version only while nobody has moved the question.

A freeze submitted without naming a version MUST adopt the version being asked
about, for the same reason: recording the newest text under a tally gathered on
an older one is the failure this requirement exists to prevent.

#### Scenario: A version is selected
- **WHEN** a reader selects v2 in a thread that has reached v4
- **THEN** the panel shows v2's text, v2's responses and v2's linter result
- **AND** v4's responses are not counted anywhere on the panel

#### Scenario: A version is linked
- **WHEN** someone opens a link naming v2
- **THEN** the panel opens with v2 selected

#### Scenario: No version is named
- **WHEN** a reader opens the discussion with no version named
- **THEN** the version the discussion is asking about is selected

#### Scenario: No version is named and the question has been moved
- **WHEN** a reader opens a discussion where v4 exists and v3 is the version being asked about
- **THEN** v3 is selected, so the panel and the response form agree

#### Scenario: A version that does not exist
- **WHEN** a link names a version the thread never produced
- **THEN** the version being asked about is selected, rather than an empty panel

#### Scenario: A version from another discussion
- **WHEN** a link names a proposal belonging to a different discussion
- **THEN** it is not shown, and the version this discussion is asking about is selected

#### Scenario: A freeze names no version
- **WHEN** a freeze is submitted for a thread where v4 exists and v3 is being asked about, naming no version
- **THEN** v3 is the version recorded

#### Scenario: A thread with no proposal
- **WHEN** a reader opens a discussion nobody has proposed in
- **THEN** no version is selected and the panel offers writing one

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

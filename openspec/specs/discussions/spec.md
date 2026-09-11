# discussions Specification

## Purpose
Covers where a community argues before it decides: a discussion belongs to one community and to at most one subject, a proposal is a first-class object rather than a post that looks different, deciding in a room reaches the same freeze as deciding in a thread, and any member may propose while only a steward may record.
## Requirements
### Requirement: A discussion belongs to one community, and to at most one subject

A discussion MUST be reachable only from inside the community that owns it. It
MAY name the clause or definition it is about, and MAY name neither — the field
is offered as optional and has to mean it. A clause it names MUST exist in the
standard the community adopted, and MUST be stored by the clause's stable key
whichever of the clause's two names was typed.

#### Scenario: A member opens a discussion on a clause with no definition
- **WHEN** a member starts a discussion from a clause
- **THEN** the discussion is created against that clause
- **AND** it appears in that community's discussion list

#### Scenario: A member types the reference rather than the key
- **WHEN** a member enters the clause reference the standard browser shows them
- **THEN** the discussion is stored against that clause's stable key
- **AND** the community's outstanding work shows the discussion as already open

#### Scenario: A member leaves the clause field empty
- **WHEN** a member starts a discussion without naming a clause
- **THEN** the discussion is created about nothing in the standard
- **AND** it can be discussed and proposed on like any other

#### Scenario: A member names a clause the standard does not have
- **WHEN** a member enters a clause that is in neither name
- **THEN** the discussion is refused at that point, where the typing happened

#### Scenario: A member of another community requests it
- **WHEN** a member of community B requests a discussion belonging to A
- **THEN** the answer is the same as for a discussion that does not exist

### Requirement: A proposal is a first-class object, not a post that looks different

A proposal MUST be a distinct record carrying its own text, version number and
author, MUST be attached to a discussion, and MUST be the only thing a freeze can
be based on.

#### Scenario: A proposal is written
- **WHEN** a member posts a proposal in a thread
- **THEN** it is recorded as a proposal with version 1

#### Scenario: A proposal is revised
- **WHEN** another proposal is posted in the same thread
- **THEN** it is version 2, and version 1 remains readable

#### Scenario: A freeze is attempted without a proposal
- **WHEN** a steward tries to freeze a discussion that has none
- **THEN** it is refused, and the reason names the missing proposal

### Requirement: Deciding in a room is a first-class path

A discussion MUST be able to be marked as decided offline, carrying a summary and
the proposal that came out of the meeting, and MUST then reach the same freeze
with the same required fields as any other path.

#### Scenario: A thread is taken offline and returns
- **WHEN** a member marks a discussion decided offline and enters a summary and a proposal
- **THEN** the thread records who wrote the summary and when
- **AND** the discussion can be frozen

#### Scenario: The record says how it was reached
- **WHEN** a decision is frozen from an offline path
- **THEN** the decision records that the discussion happened offline

### Requirement: A member may propose; recording remains with a steward

Any member MUST be able to start a discussion, comment, and post a proposal. Only
a steward MUST be able to freeze.

#### Scenario: A member posts a proposal
- **WHEN** a plain member posts a proposal
- **THEN** it is accepted

#### Scenario: A member attempts a freeze
- **WHEN** a plain member submits the freeze form
- **THEN** it is refused, and no decision is created

### Requirement: A thread names who wrote each post

Every post in a discussion MUST be shown with its author, and the author MUST be
named through the one function that decides how a person is named, so that a
person who has asked to be forgotten is not named by this surface after their
erasure.

#### Scenario: A message is read
- **WHEN** a member reads a thread
- **THEN** each post shows who wrote it and when

#### Scenario: The author has been erased
- **WHEN** a post's author has been erased
- **THEN** the post still appears and is attributed to their community's former-member label
- **AND** their name appears nowhere on the screen

#### Scenario: A member has chosen a display name
- **WHEN** a post's author has set a display name in this community
- **THEN** the thread shows the display name rather than their account name

#### Scenario: A post from another community's thread
- **WHEN** a thread belonging to another community is requested
- **THEN** the answer is the same as for a thread that does not exist, and no author is disclosed

### Requirement: A revision says what changed

A proposal version after the first MUST be able to carry a note describing what
changed, and the note MUST be shown in the thread as an event at the point the
revision was made, alongside a way to compare that version with the one before
it.

The note MUST be optional: a revision without one is still a revision.

#### Scenario: A revision is posted with a note
- **WHEN** a member revises the proposal and describes what changed
- **THEN** the thread shows a revision event carrying the note and the new version number
- **AND** the event offers a comparison between the two versions

#### Scenario: A revision is posted without a note
- **WHEN** a member revises the proposal and writes no note
- **THEN** the thread still shows the revision event with the new version number

#### Scenario: The first version
- **WHEN** v1 is posted
- **THEN** no revision event is shown, because there is nothing it changed

### Requirement: A thread stays open after a freeze

Freezing a proposal MUST NOT end the discussion it came from. A thread that has
produced a decision MUST still accept messages, responses and new proposal
versions, so that a community can keep working on the same question and freeze a
later version when it is ready.

A thread MUST record which decision it most recently produced, and MUST say on
screen what has been decided so far rather than telling a member to start a new
discussion.

#### Scenario: The thread continues after a decision
- **WHEN** v3 has been frozen and a member posts a reply
- **THEN** the reply is accepted

#### Scenario: A later version is written
- **WHEN** a member posts a new proposal in a thread that has already produced a decision
- **THEN** it is recorded as the next version and becomes the one on the table

#### Scenario: The thread names its decisions
- **WHEN** a member opens a thread that has produced two decisions
- **THEN** the screen names the decision in force and does not tell them to start a new discussion

#### Scenario: An abandoned thread
- **WHEN** a member posts to a thread that was abandoned
- **THEN** it is refused, because abandoning is what ends a thread

#### Scenario: A suspended community
- **WHEN** a member posts to a thread in a suspended community
- **THEN** it is refused, because a suspended community reads and exports only

### Requirement: One version is selected, and the whole proposal panel follows it

A discussion MUST let a reader select any proposal version the thread has
produced. The proposal text, the responses, the linter result and the freeze MUST
all show that version and no other.

The selection MUST be addressable, so that a link to a version opens on it and
the panel works without JavaScript. With no selection given, the most recent
version MUST be selected.

#### Scenario: A version is selected
- **WHEN** a reader selects v2 in a thread that has reached v4
- **THEN** the panel shows v2's text, v2's responses and v2's linter result
- **AND** v4's responses are not counted anywhere on the panel

#### Scenario: A version is linked
- **WHEN** someone opens a link naming v2
- **THEN** the panel opens with v2 selected

#### Scenario: No version is named
- **WHEN** a reader opens the discussion with no version named
- **THEN** the most recent version is selected

#### Scenario: A version that does not exist
- **WHEN** a link names a version the thread never produced
- **THEN** the most recent version is selected, rather than an empty panel

#### Scenario: A version from another discussion
- **WHEN** a link names a proposal belonging to a different discussion
- **THEN** it is not shown, and the most recent version of this discussion is selected

#### Scenario: A thread with no proposal
- **WHEN** a reader opens a discussion nobody has proposed in
- **THEN** no version is selected and the panel offers writing one

### Requirement: Revising is a distinct act from replying

The composer MUST offer replying and revising as separate acts. Replying MUST
never create or alter a proposal version, and revising MUST always produce a new
version rather than editing the version on the table.

A revision MUST start from the text of the current version rather than from an
empty field.

#### Scenario: A member replies
- **WHEN** a member sends a reply
- **THEN** a message is recorded and the version on the table is unchanged

#### Scenario: A member revises
- **WHEN** a member revises the proposal
- **THEN** they are given the current version's text to edit
- **AND** submitting records a new version, leaving the previous one readable

#### Scenario: A member without permission to propose
- **WHEN** a member who may comment but not propose opens the composer
- **THEN** revising is not offered, and submitting a revision is refused

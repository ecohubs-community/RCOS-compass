## MODIFIED Requirements

### Requirement: A new version closes the previous version's round and does not carry its responses

Posting a new proposal version MUST close any open round on the version the
discussion is currently asking about, in the same transaction, marking it
superseded and recording which version superseded it. The closed round's
responses MUST stay readable and MUST NOT count toward the new version.

A superseded round MUST NOT be reported as open and MUST take no further
responses. It MUST still pre-fill a freeze of the version it belongs to, because
a steward may deliberately freeze an earlier version and the responses that
version received are what that decision's tally should say.

Which version takes responses MUST be the one the discussion names as current,
and MUST NOT be derived from which version is newest.

#### Scenario: A version is superseded while its round is open
- **WHEN** v4 is posted while v3's round is open with five consents
- **THEN** v3's round is closed as superseded, recording v4 as what superseded it
- **AND** its five responses remain readable against v3

#### Scenario: The new version starts from nothing
- **WHEN** v4 has been posted and nobody has responded to it
- **THEN** v4 has no round and no responses
- **AND** the screen states that v3's consents were not carried, because the text changed

#### Scenario: An earlier version is frozen from its own superseded round
- **WHEN** a steward freezes v3 after v4 superseded it
- **THEN** the freeze is pre-filled from v3's superseded round, not from v4's

#### Scenario: The current version is frozen
- **WHEN** a steward freezes v4, which has its own open round
- **THEN** the freeze is pre-filled from v4's round, and v3's superseded round does not contribute

#### Scenario: A response arrives for a version that is not the current one
- **WHEN** a member submits a response to a version the discussion is not asking about
- **THEN** it is refused, and no round's counts change

#### Scenario: A newer version exists but is not the question
- **WHEN** v4 exists, the discussion names v3 as current, and a member responds to v3
- **THEN** the response is recorded against v3
- **AND** a response to v4 is refused

#### Scenario: The posting fails
- **WHEN** writing the new version fails after the previous round was closed
- **THEN** neither happens, and the previous round is still open

## ADDED Requirements

### Requirement: A superseded round reopens with the members it already had

A round closed as superseded MUST reopen, with its existing responses and its
existing set of eligible members, when a steward moves the question back to the
version it belongs to. It MUST NOT take a fresh eligibility snapshot.

A round closed for any other reason MUST NOT reopen. A round whose deadline has
passed, and a round every eligible member has already answered, MUST stay closed;
asking that question again MUST require a new round, so that the denominator a
community is given is always one it was told about.

Any round open on the version that was current MUST be closed as superseded in
the same transaction, so that exactly one round is open at any moment.

#### Scenario: A superseded round comes back
- **WHEN** a steward makes v3 current again and v3's round was closed as superseded
- **THEN** v3's round is open, its five consents are intact, and its eligible members are the ones captured when it first opened

#### Scenario: A member who joined in the meantime
- **WHEN** a member joined while v4 was the question, and v3's round is reopened
- **THEN** they are not eligible for v3's round, and its denominator is unchanged

#### Scenario: The round that was current is closed
- **WHEN** v4 has an open round and a steward makes v3 current again
- **THEN** v4's round is closed as superseded and takes no further responses
- **AND** v4's responses stay readable against v4

#### Scenario: A round that ran out of time
- **WHEN** a steward makes current a version whose round closed at its deadline
- **THEN** that round stays closed, and responding to that version is refused until a new round is opened on it

#### Scenario: A version that never had a round
- **WHEN** a steward makes current a version nobody ever responded to
- **THEN** no round exists, and the first response to it opens one as usual

#### Scenario: The move fails
- **WHEN** reopening the earlier round fails after the current one was closed
- **THEN** neither happens, and the question has not moved

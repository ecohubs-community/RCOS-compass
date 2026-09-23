## ADDED Requirements

### Requirement: A member may ask for the question to be moved back to an earlier version

A member or steward SHALL be able to ask, in the thread, for the question to be
moved back to an earlier proposal version, with a reason. The request MUST be
recorded as a thread post and as a record with a state of `open`, `granted`,
`declined`, `withdrawn` or `lapsed`. A member MUST have at most one open request
per discussion. Asking for the version that is already current MUST be refused.
Asking MUST NOT move the question.

#### Scenario: A member asks
- **WHEN** a member asks to put v3 back while v4 is current, with a reason
- **THEN** a post in the thread says they asked for v3 and why
- **AND** the request is open and v4 is still the question

#### Scenario: Asking for the current version
- **WHEN** a member asks for the version that is already current
- **THEN** it is refused

#### Scenario: Asking twice
- **WHEN** a member with an open request asks again in the same discussion
- **THEN** it is refused, naming their open request

#### Scenario: The requester withdraws
- **WHEN** the member withdraws their open request
- **THEN** it is withdrawn and the post says so

#### Scenario: Another community
- **WHEN** a member submits a request for a discussion in another community
- **THEN** the response is not found

### Requirement: A steward answers a move request from the thread

A steward SHALL be able to grant an open move request, which MUST move the
question to the requested version exactly as putting it back directly does, in
the same transaction as marking the request granted; or decline it with a
required note. Both MUST be attributed. A member MUST NOT be permitted to grant
or decline.

#### Scenario: A steward grants
- **WHEN** a steward grants a request for v3
- **THEN** v3 becomes the question, its superseded round reopens as putting it back does
- **AND** the request reads granted by that steward

#### Scenario: A steward declines
- **WHEN** a steward declines with the note "v4 fixes the notice period; let's finish it"
- **THEN** the request reads declined with the note, and the question does not move

#### Scenario: Declining without a note
- **WHEN** a steward declines without a note
- **THEN** it is refused and the request stays open

#### Scenario: A member tries to grant
- **WHEN** a member submits a grant directly
- **THEN** it is refused and the question does not move

### Requirement: A move request is settled when the question moves anyway

When the question moves while a request is open, the request SHALL be settled in
the same transaction: marked granted, attributed to whoever moved it, if the
question moved to the requested version; otherwise marked lapsed.

#### Scenario: A steward moves the question directly to the requested version
- **WHEN** a steward puts v3 back without answering the open request for v3
- **THEN** the request reads granted, attributed to that steward

#### Scenario: A newer version is posted
- **WHEN** v5 is posted while a request for v3 is open
- **THEN** the request reads lapsed

### Requirement: A discussion may be opened on a definition

A discussion SHALL be openable on an existing definition, in addition to a clause
or an open question. The definition MUST belong to the community. A discussion
opened on a definition MUST be linked to it.

#### Scenario: Opened on a local definition
- **WHEN** a member opens a discussion on a local definition
- **THEN** the discussion is linked to that definition and listed on its page

#### Scenario: A definition from another community
- **WHEN** the open form names a definition from another community
- **THEN** it is refused as not found and no discussion is created

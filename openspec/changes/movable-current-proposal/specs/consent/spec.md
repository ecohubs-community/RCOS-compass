## MODIFIED Requirements

### Requirement: A consent round collects one response per member and closes

A consent round MUST open on the first response to a proposal version rather
than by a separate act, MUST capture its set of eligible members at the moment
it opens, and MUST accept at most one response per eligible member of `consent`,
`objection` or `abstain`.

A version MUST hold at most one round. A response to a version whose round is
not open MUST be refused, and MUST NOT open a second round — a second round is
invisible to every screen that reads one, so the answers in it are gathered and
never seen.

A round MAY have a deadline and MUST NOT require one. A round with a deadline
MUST close at it. **Answering MUST NOT close a round.** A round with no deadline
MUST stay open until the version it belongs to is superseded or the proposal is
frozen, including after every eligible member has responded, so that a member
may still change their answer. Closing on the last response took that from
everybody, by whoever happened to answer last.

Opening MUST be a system act carried out in the same transaction as the response
that triggered it. A member responding MUST NOT need the permission to open a
round, and such a round MUST record nobody as having opened it.

Opening a round deliberately, with a chosen deadline, MUST remain available to a
steward and MUST remain permission-checked.

#### Scenario: The first response opens the round
- **WHEN** a member responds to a proposal version that has no round
- **THEN** a round is opened, its eligible members are captured, and the response is recorded
- **AND** both happen in one transaction, so a failure records neither

#### Scenario: A plain member responds first
- **WHEN** a member with no steward permission is the first to respond
- **THEN** the round opens and their response is recorded
- **AND** the round names no member as having opened it

#### Scenario: A plain member opens a round deliberately
- **WHEN** a member with no steward permission tries to open a round with a deadline
- **THEN** it is refused, and no round is created

#### Scenario: The second response does not open a second round
- **WHEN** another member responds to the same version
- **THEN** their response joins the existing round

#### Scenario: A response to a version whose round has closed
- **WHEN** a member responds to a version whose round reached its deadline
- **THEN** it is refused, and no second round is opened on that version

#### Scenario: A member responds twice
- **WHEN** a member submits a second response to the same round
- **THEN** their earlier response is replaced, not duplicated

#### Scenario: Someone outside the community responds
- **WHEN** a member of another community submits a response
- **THEN** it is refused and nothing is recorded, and no round is opened

#### Scenario: Someone joins after the round opened
- **WHEN** a new member joins while a round is open
- **THEN** they are not eligible, because eligibility was captured when the round opened
- **AND** the round's denominator is unchanged

#### Scenario: Someone joins between the proposal and the first response
- **WHEN** a member joins after a version is posted but before anyone responds to it
- **THEN** they are eligible, because the round had not opened yet

#### Scenario: Someone leaves while the round is open
- **WHEN** an eligible member's membership ends mid-round
- **THEN** their response, if any, remains counted
- **AND** the round can still close

#### Scenario: The deadline passes
- **WHEN** a round with a deadline reaches it with some members not having responded
- **THEN** the round closes and reports how many of how many responded

#### Scenario: A round with no deadline is left alone
- **WHEN** time passes on a round with no deadline and not everyone has responded
- **THEN** the round stays open and reports how many of how many have responded so far

#### Scenario: Everyone responds early
- **WHEN** the last eligible member responds
- **THEN** the round stays open, because the tally is complete and a freeze reads it either way
- **AND** any of them may still change their answer

#### Scenario: Changing an answer after everybody has answered
- **WHEN** a member who consented objects instead, after every eligible member has responded
- **THEN** their answer is replaced and the tally follows it

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

A deadline that has passed MUST be cleared as the round reopens, and the screen
MUST say so before the move is made. A deadline nobody can still meet would
close the round again on the next read, leaving a reopen that lasts until
somebody looks at the page.

The state of a round MUST NOT refuse the move. A round every eligible member has
already answered MUST stay closed — there is nobody left to ask — and the
version MUST still become the one being asked about, so that it can be recorded.
What happened to the round MUST be stated in the thread. Nothing MUST direct a
member to open a round by hand: a version holds at most one round, and no
surface opens one.

Any round open on the version that was current MUST be closed as superseded in
the same transaction, so that exactly one round is open at any moment.

Reopening MUST tell the eligible members who have not yet answered that the
proposal is open for their response, and MUST NOT tell those who have. Closing
the round that was current MUST notify nobody.

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

#### Scenario: A superseded round whose deadline has since passed
- **WHEN** a steward makes current a version whose round was superseded before its deadline, and that deadline has since gone
- **THEN** the round reopens with no deadline, and the thread records that its deadline had passed
- **AND** the steward was told so on the form before they moved it

#### Scenario: A superseded round everybody had answered
- **WHEN** a steward makes current a version whose round every eligible member had answered
- **THEN** the version becomes the one being asked about, so it can be recorded
- **AND** the round stays closed, because there is nobody left to ask, and the thread says so
- **AND** its responses stay readable and still pre-fill a freeze of that version

#### Scenario: Who hears about it
- **WHEN** a round reopens with four of twenty-seven having already answered
- **THEN** the twenty-three who have not are told the proposal is open for their response
- **AND** the four who have are not told, and nobody is told about the round that closed

#### Scenario: A version that never had a round
- **WHEN** a steward makes current a version nobody ever responded to
- **THEN** no round exists, and the first response to it opens one as usual

#### Scenario: The move fails
- **WHEN** writing the move fails after the current round was closed
- **THEN** neither happens, and the question has not moved

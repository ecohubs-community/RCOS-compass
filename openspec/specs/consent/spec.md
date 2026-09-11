# consent Specification

## Purpose
Covers how a community registers dissent and agreement: an objection is a durable record with a reason and a lifecycle, a consent round captures its eligible members when it opens and collects one response from each, and the tally a closed round produces informs a freeze without ever performing one.
## Requirements
### Requirement: An objection is a record with a reason and a lifecycle

An objection MUST carry a reason and a state of `open`, `withdrawn`, `addressed`
or `overruled`. An objection MUST NOT be deletable, and its state changes MUST be
attributable.

#### Scenario: An objection is raised
- **WHEN** a member objects to a proposal with a reason
- **THEN** the objection is recorded as open, with its author

#### Scenario: An objection is resolved
- **WHEN** a steward marks it addressed
- **THEN** the state changes and records who changed it and when

#### Scenario: Deletion is attempted
- **WHEN** a request tries to remove an objection
- **THEN** it is refused

#### Scenario: The objector changes their response
- **WHEN** a member who objected in a consent round responds again with consent
- **THEN** their objection is withdrawn rather than left open or deleted
- **AND** the reason they gave stays readable
- **AND** the round reports no unresolved objection

#### Scenario: A member objects twice
- **WHEN** a member replaces their objection with a differently-worded one
- **THEN** exactly one objection of theirs is open

#### Scenario: The community is suspended
- **WHEN** a steward tries to address or overrule an objection
- **THEN** it is refused, because a suspended community reads and exports only

### Requirement: A decision frozen over an open objection says so, permanently

Freezing MUST be permitted while objections are open, and the resulting decision
MUST record the count of unresolved objections and display it wherever the
decision is shown.

The person freezing MUST be told the count and its consequence before they
submit, on the form itself, and not only after the decision exists.

#### Scenario: Freezing with an unresolved objection
- **WHEN** a steward freezes a proposal that has one open objection
- **THEN** the decision is created
- **AND** it reads as frozen with 1 unresolved objection in the register and on its permalink

#### Scenario: The freeze form is opened with an objection outstanding
- **WHEN** a steward opens the freeze on a proposal with one open objection
- **THEN** the form states that the decision will be recorded as frozen with 1 unresolved objection
- **AND** it does not prevent the freeze

#### Scenario: The freeze form is opened with nothing outstanding
- **WHEN** every objection is withdrawn or addressed and the steward opens the freeze
- **THEN** the form makes no unresolved-objection statement

#### Scenario: All objections resolved before freezing
- **WHEN** every objection is withdrawn or addressed before the freeze
- **THEN** the decision carries no unresolved-objection note

### Requirement: A consent round collects one response per member and closes

A consent round MUST open on the first response to a proposal version rather
than by a separate act, MUST capture its set of eligible members at the moment
it opens, and MUST accept at most one response per eligible member of `consent`,
`objection` or `abstain`.

A round MAY have a deadline and MUST NOT require one. A round with a deadline
MUST close at it. A round with no deadline MUST stay open until every eligible
member has responded, until the version it belongs to is superseded, or until
the proposal is frozen.

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
- **THEN** the round closes immediately, whether or not it has a deadline

### Requirement: A round informs a freeze and never performs one

A closed round MUST produce a tally that pre-fills the freeze. Closing a round
MUST NOT create a decision, a version or a change-log entry.

#### Scenario: A round closes
- **WHEN** a consent round reaches its deadline
- **THEN** no decision exists yet

#### Scenario: The freeze is opened after a round
- **WHEN** a steward opens the freeze form for a proposal with a closed round
- **THEN** the mechanism, threshold, who was present and the tally are pre-filled from it
- **AND** every one of them can still be changed by the person freezing

#### Scenario: A community ignores the round
- **WHEN** a steward freezes with a tally that differs from the round's
- **THEN** the decision records the tally the steward entered

### Requirement: Voting runs behind a provider interface

Consent rounds MUST be reached through a voting-provider interface, so a second
provider can be added without changing the freeze.

#### Scenario: The built-in provider is used
- **WHEN** a round is opened with no provider named
- **THEN** the built-in consent round is used

#### Scenario: The freeze consumes a tally, not a round
- **WHEN** the freeze path is inspected
- **THEN** it depends on a tally and on no provider-specific type

### Requirement: A response of any value may carry a reason, and the reason is readable in the thread

A response of `consent`, `objection` or `abstain` MUST be able to carry a reason,
and a reason MUST NOT be required for any of them. A reason given with a response
MUST be recorded as a post in the discussion the proposal belongs to, attributed
to the responder, so that it reads as part of the conversation rather than as
data behind a number.

An objection MUST continue to require its reason. Changing a response MUST leave
the earlier reason readable rather than removing its post.

#### Scenario: A member consents with a reason
- **WHEN** a member consents and gives a reason
- **THEN** the response is recorded as consent
- **AND** the reason appears in the thread as a post attributed to them

#### Scenario: A member abstains with a reason
- **WHEN** a member abstains and gives a reason
- **THEN** the response is recorded as abstain and the reason appears in the thread

#### Scenario: A member consents without a reason
- **WHEN** a member consents and gives no reason
- **THEN** the response is recorded and no post is created

#### Scenario: An objection without a reason
- **WHEN** a member objects and gives no reason
- **THEN** it is refused, because an objection without one cannot be addressed

#### Scenario: A member changes their mind
- **WHEN** a member who objected with a reason responds again with consent
- **THEN** their objection is withdrawn and the post carrying the original reason stays in the thread
- **AND** the new response's reason, if any, is a further post

#### Scenario: A member of another community submits a reason
- **WHEN** a response with a reason arrives for a proposal in a community the member does not belong to
- **THEN** it is refused, and no post is written to that community's thread

### Requirement: The votes on a version are readable together, where the first was cast

The responses to one proposal version MUST be presentable as a single block in
the discussion thread, positioned at the moment the first response to that
version was recorded.

Collapsed, the block MUST state the counts and the denominator. Expanded, it MUST
list every response with its value, the responder, their reason if they gave one,
and when it was cast. Any count shown elsewhere on the screen MUST lead to this
block rather than to an individual post.

#### Scenario: The block is placed
- **WHEN** the first response to v3 is recorded
- **THEN** the block for v3's responses appears in the thread at that point
- **AND** later responses to v3 join it rather than creating a second block

#### Scenario: The block is expanded
- **WHEN** a member expands the block
- **THEN** every response to that version is listed with its value, responder, reason and time

#### Scenario: A count is followed
- **WHEN** a member follows a count shown beside the proposal
- **THEN** they reach this block, whether the count stands for one response or several

#### Scenario: A responder has been erased
- **WHEN** the block is read after one of its responders has been erased
- **THEN** their response is still listed and still counted
- **AND** they render as their community's former-member label

### Requirement: A new version closes the previous version's round and does not carry its responses

Posting a new proposal version MUST close any open round on the previous version
in the same transaction, marking it superseded and recording which version
superseded it. The closed round's responses MUST stay readable and MUST NOT
count toward the new version.

A superseded round MUST NOT be reported as open and MUST take no further
responses. It MUST still pre-fill a freeze of the version it belongs to, because
a steward may deliberately freeze an earlier version and the responses that
version received are what that decision's tally should say.

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

#### Scenario: A response arrives for a superseded version
- **WHEN** a member submits a response to a version that has been superseded
- **THEN** it is refused, and the superseded round's counts are unchanged

#### Scenario: The posting fails
- **WHEN** writing the new version fails after the previous round was closed
- **THEN** neither happens, and the previous round is still open

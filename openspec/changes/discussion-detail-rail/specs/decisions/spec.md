## MODIFIED Requirements

### Requirement: A proposal can be frozen once

Freezing MUST record the decision on the proposal, and MUST refuse a proposal
that has already been frozen, naming the decision that exists.

A thread MUST be able to produce more than one decision over its life. A version
other than the most recent MAY be frozen, and freezing one version MUST NOT
prevent a later version of the same thread being frozen afterwards. What is spent
is the proposal, not the discussion.

#### Scenario: Two stewards freeze the same proposal
- **WHEN** two stewards submit separate freeze forms for one proposal
- **THEN** exactly one decision is created
- **AND** the second is refused with the reference of the first

#### Scenario: A superseding decision is wanted
- **WHEN** a community wants to change what it decided
- **THEN** it must produce a new proposal, because the old one is spent
- **AND** the new proposal may be written in the same discussion

#### Scenario: A later version is frozen months afterwards
- **WHEN** a thread whose v3 was frozen produces a v5 and a steward freezes it
- **THEN** a second decision is created
- **AND** it supersedes the decision that adopted v3, which keeps its reference, text and tally

## ADDED Requirements

### Requirement: A freeze adopts the version the steward chose, and says when that is not the latest

The freeze MUST adopt the specific proposal version the steward selected, and
MUST carry that version from the form through to the record rather than resolving
the thread's most recent proposal at submission time.

Freezing a version that is not the most recent MUST be permitted, because the
text a community agreed on is not always the last one anybody typed. When the
selected version is not the most recent, the form MUST say so and name the later
version, so that nobody records an earlier text without knowing a later one
exists.

#### Scenario: The form names its version
- **WHEN** a steward opens the freeze on v3
- **THEN** the form states that it will adopt v3, and when v3 was written

#### Scenario: An earlier version is chosen deliberately
- **WHEN** v4 has been posted and objected to, and a steward freezes v3
- **THEN** the decision adopts v3's text
- **AND** the form said, before submission, that v4 is the later version

#### Scenario: A newer version arrives while the form is open
- **WHEN** a steward submits a freeze opened on v3 after v4 has been posted
- **THEN** the decision still adopts v3, because v3 is what the form carried
- **AND** v4 is untouched and remains freezable later

#### Scenario: The version belongs to another discussion
- **WHEN** a freeze names a proposal that is not in the discussion being frozen
- **THEN** it is refused, and no decision is created

#### Scenario: The version belongs to another community
- **WHEN** a freeze names a proposal in a community the steward does not belong to
- **THEN** the answer is the same as for a proposal that does not exist

#### Scenario: A member submits the freeze
- **WHEN** a member with no permission to freeze submits the form
- **THEN** it is refused, and no decision is created

### Requirement: A version says whether it was frozen and whether that still stands

Each proposal version MUST be presentable in one of three states: never frozen,
frozen into a decision that is still active, and frozen into a decision that a
later decision superseded.

The state MUST be derived from the decision the version was frozen into and that
decision's own status, and MUST NOT be stored separately on the version.

#### Scenario: A version has never been frozen
- **WHEN** v4 has never been frozen
- **THEN** it reads as never frozen

#### Scenario: A version's decision is the one in force
- **WHEN** v3 was frozen and its decision is active
- **THEN** v3 reads as frozen and in force, and names its decision

#### Scenario: A later freeze supersedes an earlier one
- **WHEN** v5 is frozen and supersedes the decision that adopted v3
- **THEN** v5 reads as frozen and in force
- **AND** v3 reads as frozen and superseded, naming the decision that replaced it

#### Scenario: The superseded version's record is intact
- **WHEN** v3 is read after being superseded
- **THEN** its own text, responses and decision reference are unchanged

### Requirement: The freeze records a review date and who was present, from its own form

The freeze form MUST offer a review date and the list of who was present,
including each attendee's consent to be named, and MUST carry both to the
service that records the decision. Where the selected version's round has
responses, both MUST be pre-filled from it and MUST remain editable.

#### Scenario: A review date is set
- **WHEN** a steward sets a review date and freezes
- **THEN** the decision records that date

#### Scenario: No review date is set
- **WHEN** a steward freezes without setting one
- **THEN** the decision records no review date, and this is not an error

#### Scenario: Attendees are pre-filled from the selected version's round
- **WHEN** a steward opens the freeze on v3, whose round has responses
- **THEN** the people who responded to v3 are offered as those present
- **AND** the steward can add, remove or change any of them before submitting

#### Scenario: The selected version has no round
- **WHEN** a steward opens the freeze on a version nobody responded to
- **THEN** nobody is pre-filled, and the steward may still record who was present

#### Scenario: An attendee is named without consent
- **WHEN** a steward records an attendee who did not consent to being named
- **THEN** the attendee is stored with consent withheld, and is still counted

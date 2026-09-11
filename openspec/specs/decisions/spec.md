# decisions Specification

## Purpose
Covers the freeze, the moment a proposal becomes a decision: what is written atomically, how references are allocated per community and never reused, how a decision keeps quoting the clause reference as it stood at the time, how re-deciding supersedes rather than rewrites, and what remains findable a year later.
## Requirements
### Requirement: A freeze produces the decision, the version and the change-log entry atomically

A freeze MUST create the decision record, the definition version it adopts, and
the change-log entry in one transaction. If any part fails, none MUST be visible.

#### Scenario: A freeze succeeds
- **WHEN** a steward freezes a proposal
- **THEN** a decision, an adopted version and a change-log entry all exist
- **AND** the definition's adopted version is the new one

#### Scenario: A freeze fails part-way
- **WHEN** the write fails after the decision row is prepared
- **THEN** no decision, no version and no change-log entry are stored
- **AND** no reference number has been consumed

### Requirement: Decision references are gapless and permanent

Each decision MUST receive a per-community sequence number allocated inside the
freeze transaction, and a reference of the form `DEC-<year>-<seq>` where the year
is the freeze date in the community's own timezone. A reference MUST never be
reused or renumbered.

#### Scenario: Three decisions in a row
- **WHEN** three freezes succeed in one community
- **THEN** their sequence numbers are consecutive with no gaps

#### Scenario: A freeze rolls back between two successful ones
- **WHEN** a freeze fails and another then succeeds
- **THEN** the successful one takes the number the failed one did not consume

#### Scenario: A community east of UTC freezes late in the evening
- **WHEN** a community whose timezone is ahead of UTC freezes at 23:59 local on 31 December
- **THEN** the reference carries the local year, not the server's

#### Scenario: Two communities freeze
- **WHEN** community A and community B each freeze for the first time
- **THEN** each gets sequence 1, because the counter is per community

### Requirement: A duplicate freeze returns the first decision

A freeze MUST carry an idempotency key issued when the form was rendered. A second
submission with the same key MUST return the decision already created and MUST
NOT create a second one or consume a second number.

#### Scenario: Freeze is pressed twice
- **WHEN** the same freeze form is submitted twice
- **THEN** one decision exists
- **AND** the second submission returns that same decision

#### Scenario: A key from a different form
- **WHEN** a freeze is submitted with a key no decision carries
- **THEN** it is treated as a new freeze

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

### Requirement: A decision quotes a clause reference and keeps quoting it

A decision MUST record, for each clause it answers, the standard, the version and
the reference **as they stood at decision time**, alongside the stable clause key.
No migration or standard upgrade MUST rewrite a stored reference.

#### Scenario: A decision is recorded
- **WHEN** a decision answering clause `3.6.3` of core 0.1 is frozen
- **THEN** it stores the standard, the version `0.1`, the reference `3.6.3` and the clause key

#### Scenario: The standard renumbers the clause
- **WHEN** a later version of the standard gives that obligation a different reference
- **THEN** the existing decision still reads `3.6.3` at version 0.1
- **AND** the clause key still resolves it to the same obligation

### Requirement: Re-freezing supersedes rather than rewrites

Freezing a definition that already has an adopted version MUST mark the previous
decision superseded and record what replaced it. The superseded decision's
reference, text and tally MUST remain unchanged and its permalink MUST keep
resolving.

#### Scenario: A definition is decided a second time
- **WHEN** a new decision adopts a new version of a definition
- **THEN** the previous decision is marked superseded and names the new one
- **AND** its own reference, text and tally are unchanged

#### Scenario: An old reference is quoted
- **WHEN** someone opens the superseded decision's permalink
- **THEN** it resolves, says it was superseded, and links to the decision that replaced it

### Requirement: Who was present is recorded, and so is their consent to be named

A freeze MUST record who was present, and for each named person MUST record
whether they consented to being named outside the community.

Consent MUST be per attendee. No community-level setting MUST be able to publish
the name of an attendee who did not consent, and the absence of consent MUST NOT
prevent the count from being published.

Attendance MUST reference the membership rather than a name held on the decision,
so that a person can be erased without the record changing. An erased attendee
MUST render as their community's former-member label, inwardly and outwardly,
and MUST still be counted.

#### Scenario: A decision is frozen with attendees
- **WHEN** a steward records who was present
- **THEN** each attendee is stored with their consent-to-publish flag

#### Scenario: Nobody consented
- **WHEN** no attendee consented to being named
- **THEN** the decision still records the count, so a tally is possible without names

#### Scenario: The community publishes names
- **WHEN** a community sets its attribution policy to names and publishes a decision
- **THEN** only attendees who consented individually are named
- **AND** the others are still counted in the tally

#### Scenario: An attendee is erased
- **WHEN** a person who attended a frozen decision is erased
- **THEN** the decision's tally is unchanged and they render as a former member

#### Scenario: An erased attendee who had consented to be named
- **WHEN** the decision is read publicly after their erasure
- **THEN** their name does not appear, because there is no longer a name to show

### Requirement: The change log is append-only

Every change-log entry MUST be immutable once written. No interface MUST offer to
edit or remove one.

#### Scenario: A freeze writes an entry
- **WHEN** a decision is frozen
- **THEN** a change-log entry records the actor, the time and what changed

#### Scenario: Editing is attempted
- **WHEN** a write is attempted against an existing entry
- **THEN** it is refused

### Requirement: A suspended community records nothing new

While a community is suspended it MUST refuse writes, including freezing, while
continuing to serve reads and exports.

#### Scenario: A steward freezes in a suspended community
- **WHEN** the freeze is submitted
- **THEN** it is refused and no decision is created

#### Scenario: The register is read
- **WHEN** a member of a suspended community opens the decision register
- **THEN** it is served

### Requirement: A decision is findable a year later

Every decision MUST have a permalink, MUST appear in the register with its type,
layer, date, review date, mechanism and tally, and MUST be findable by searching
for the question it answers.

Searching MUST go through the application's search index rather than scanning the
decision table, and MUST return only decisions recorded by the searching member's
own community — the boundary being part of the query rather than a filter applied
to its results.

#### Scenario: A decision is looked up by reference
- **WHEN** its reference is opened
- **THEN** the decision, the proposal text as adopted, its rationale and its related clauses are shown

#### Scenario: A member asks a question in their own words
- **WHEN** a member searches for wording that appears in an adopted definition
- **THEN** the decision and the clause it answers are both offered

#### Scenario: A member of another community opens the permalink
- **WHEN** they request it
- **THEN** the answer is the same as for a decision that does not exist

#### Scenario: A member of another community searches for its words
- **WHEN** a member searches for wording that appears only in another community's decision
- **THEN** nothing is returned

#### Scenario: A decision recorded a moment ago
- **WHEN** a freeze has just completed
- **THEN** searching for its words finds it, without waiting for a job

### Requirement: Decisions taken before the community has a Decision Matrix are provisional

While the Decision Matrix artifact is incomplete, every freeze MUST mark its
decision and the version it adopts as provisional, and the application MUST offer
a list of everything awaiting ratification.

#### Scenario: Freezing without a Decision Matrix
- **WHEN** a community freezes before adopting its Decision Matrix
- **THEN** the decision is recorded as provisional and the notice says so before it is confirmed

#### Scenario: The Decision Matrix is adopted later
- **WHEN** the Decision Matrix becomes complete
- **THEN** every provisional decision is listed for ratification

#### Scenario: A provisional decision is ratified
- **WHEN** a community ratifies one
- **THEN** a new decision records the ratification
- **AND** the original decision's history is not rewritten

### Requirement: The platform writes the Ratification Record

For a section the standard marks as filled from a decision, the application MUST
render the record from the decision that adopted the artifact, MUST NOT ask a
community to write it, and MUST NOT count it toward artifact completeness.

#### Scenario: An artifact is adopted
- **WHEN** a community adopts an artifact
- **THEN** its Ratification Record shows that decision's reference, date, mechanism and tally

#### Scenario: The community's queue of work
- **WHEN** the outstanding sections for an artifact are listed
- **THEN** no Ratification Record appears among them

#### Scenario: An artifact with every authored section adopted
- **WHEN** every authored section of a mandatory artifact has an adopted definition
- **THEN** the artifact is complete, even though nobody wrote its Ratification Record

### Requirement: Publishing an artifact is itself a decision

Making an artifact world-readable MUST write a decision record. The register MUST
show what was published, by whom and when, alongside every other decision.

#### Scenario: An artifact is published
- **WHEN** a steward publishes an artifact
- **THEN** a decision recording the publication appears in the register

#### Scenario: A community asks when something went public
- **WHEN** a member looks for when an artifact became world-readable
- **THEN** the register answers it

### Requirement: A decision carries the visibility of what it adopted

A freeze MUST record the visibility the adopted definition has, and changing that
visibility later MUST NOT rewrite the decision.

#### Scenario: A definition is adopted while member-visible
- **WHEN** a freeze completes
- **THEN** the decision records that the definition was member-visible at adoption

#### Scenario: The definition is published later
- **WHEN** the definition is published after being adopted
- **THEN** the original decision still says what was true when it was frozen

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

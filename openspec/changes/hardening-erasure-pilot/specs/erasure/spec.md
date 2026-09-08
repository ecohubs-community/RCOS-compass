## ADDED Requirements

### Requirement: A person can be erased, and the governance record survives

A person MUST be able to have their identity erased from the instance. Erasure
MUST remove the profile — name, email address, avatar — end every session, and
delete the credentials and verification tokens attached to the account.

Erasure MUST NOT delete, edit or renumber any decision, definition version,
change-log entry or attendance record. A decision that eleven people attended
MUST still say eleven after one of them is erased.

Nothing MUST be retained that identifies the released address, including a hash
of it. A person who later signs up with the same address MUST be treated as a
new person.

#### Scenario: A member asks to be erased
- **WHEN** erasure is carried out for a member
- **THEN** their name, email and avatar are gone from the account
- **AND** every session of theirs is ended and no credential remains that could sign in

#### Scenario: The register afterwards
- **WHEN** the decision register is read after an erasure
- **THEN** every decision, version, tally and change-log entry is byte-for-byte what it was

#### Scenario: The same address signs up again
- **WHEN** somebody registers with the address an erased person used
- **THEN** the account is new, holds no history of the erased person, and nothing links the two

#### Scenario: An attendance record
- **WHEN** an erased person attended a frozen decision
- **THEN** the attendance row is still there and still counted in the tally

### Requirement: An erased person renders as a stable, community-local label

Every surface that shows a person MUST render an erased person as `Former member
(M-####)`, where the label is the membership's sequence in its community.

The sequence MUST be assigned when the membership is created, MUST be unique
within the community, and MUST NOT be reused or renumbered. It MUST NOT be
allocated at the moment of erasure.

There MUST be exactly one function that decides how a person is rendered, and a
test MUST enumerate the services that return a person so that one which does not
use it fails.

#### Scenario: A decision shows who was present
- **WHEN** a decision with an erased attendee is read
- **THEN** that attendee reads as `Former member (M-0142)` and the others read as themselves

#### Scenario: The same person in two communities
- **WHEN** an erased person was a member of two communities
- **THEN** each community shows its own label, and neither reveals the other

#### Scenario: A new member joins after an erasure
- **WHEN** somebody joins a community where a member has been erased
- **THEN** they receive the next sequence, never the erased member's

#### Scenario: A service renders a person without the function
- **WHEN** a service returns a person's name without going through it
- **THEN** the enumerating test fails and names the service

#### Scenario: A service is added and not listed
- **WHEN** a new service returning a person is added and not registered with the test
- **THEN** the suite fails

### Requirement: Free text is corrected, and only erasure redacts

A stored body that is wrong MUST be corrected by superseding it with a new
version carrying a reason. Correction MUST NOT destroy the version it replaces.

A stored body naming a person who has asked to be erased MAY be **redacted**:
the named span is replaced in place with a marker saying a redaction happened at
the request of the person named. Redaction MUST be permitted only to a steward,
MUST be recorded in the change log with its actor, and the record MUST NOT
contain what was removed.

Redaction MUST be limited to free text — a definition version's body, a
decision's rationale and its proposal text. It MUST NOT alter a decision's
reference, date, mechanism, tally or attendance.

#### Scenario: An ordinary correction
- **WHEN** a definition's text is corrected
- **THEN** a new version supersedes the old one and the old one is still readable

#### Scenario: A name inside an adopted definition
- **WHEN** a steward redacts a name from a definition version at the request of the person named
- **THEN** the stored body carries the marker in place of the name
- **AND** a change-log entry records that a redaction was made, by whom, without quoting it

#### Scenario: A member attempts a redaction
- **WHEN** a member without steward permission attempts one
- **THEN** it is refused and the body is unchanged

#### Scenario: A redaction is attempted against a tally
- **WHEN** a redaction targets a decision's tally, attendance or reference
- **THEN** it is refused

#### Scenario: The mirror after a redaction
- **WHEN** a redaction is made in a community with a git mirror
- **THEN** a new commit is made so the current state carries the marker, and history is not rewritten

#### Scenario: Searching for a redacted name
- **WHEN** a member searches for the words that were redacted
- **THEN** nothing is returned, because the index was updated in the same transaction as the body

#### Scenario: A mirror commit names who recorded a decision
- **WHEN** a decision is frozen and committed to the mirror
- **THEN** the commit body names the membership label rather than the person's name

### Requirement: Erasure reaches the copies of a name that were made when it was written

Erasure MUST clear the personal data that was copied out of the profile at the
time it was recorded, not only the profile itself: the actor's address stored
alongside the actor id on audit events, and any invitation still open to that
address.

An audit event MUST survive with its action, its time and its actor id. Only the
copied address MUST go.

#### Scenario: The audit trail after an erasure
- **WHEN** the trail is read after somebody is erased
- **THEN** their events are still there with their actions and times
- **AND** no event carries their address

#### Scenario: A pending invitation
- **WHEN** an invitation to the erased address is still open
- **THEN** erasure revokes it and it can no longer be accepted

#### Scenario: An invitation to somebody else
- **WHEN** another member has an open invitation
- **THEN** it is untouched

### Requirement: Somebody present who was never a member is personal data too

A person recorded as present without being a member MUST be rendered through the
same function as everybody else, MUST be named in the data inventory, and MUST be
reachable by redaction on a request from the person named. They are a facilitator
or a neighbour: they hold no account and have no way to ask the product for
anything, which makes this the most exposed personal data it stores.

#### Scenario: An external attendee is shown
- **WHEN** a decision naming an external attendee is read
- **THEN** they are shown as present and not as a member

#### Scenario: An external attendee asks to be removed
- **WHEN** a steward redacts their name at their request
- **THEN** the attendance row remains and is still counted, and the name is replaced by the marker

### Requirement: Erasure is refused where it would strand a community

Erasure MUST be refused while the person is the only owner of a community. The
refusal MUST say what to do instead.

#### Scenario: The sole owner asks to be erased
- **WHEN** the only owner of a community requests erasure
- **THEN** it is refused and they are told to transfer ownership first

#### Scenario: Ownership was transferred first
- **WHEN** ownership has been transferred and erasure is requested again
- **THEN** it proceeds

#### Scenario: An ordinary member of the same community
- **WHEN** a member who owns nothing requests erasure
- **THEN** it proceeds without touching the community

### Requirement: Erasure is recorded as an act, without naming who was erased

Erasure MUST write an audit event naming who carried it out and when, and MUST
NOT record the erased person's name or address anywhere — including in the audit
event, a log line, an error report or a notification.

#### Scenario: An erasure is carried out
- **WHEN** the act completes
- **THEN** an audit event records the actor, the time and the membership label

#### Scenario: The audit trail is read afterwards
- **WHEN** an administrator reads the audit trail
- **THEN** nothing in it contains the erased person's name or address

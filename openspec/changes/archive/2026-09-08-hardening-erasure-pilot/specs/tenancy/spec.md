## ADDED Requirements

### Requirement: A membership carries a stable local number and survives its person

Every membership MUST carry a number that is unique within its community,
assigned when the membership is created, never reused and never renumbered. The
membership row MUST survive the erasure of the person it belongs to, so that
counts and history stay correct.

Reading a community's members MUST show an erased person as their former-member
label rather than omitting them, so that the count a community sees agrees with
the tallies in its own register.

Showing somebody who has **left** is deliberately not stated here: ending a
membership already excludes it from the list, and whether a departed member
should be visible is a question for the member-list screen, which does not exist
yet — `listMembers` has never had one. A requirement written for a screen nobody
has built is the kind of thing a spec should not claim.

#### Scenario: A member joins
- **WHEN** a membership is created
- **THEN** it receives the next unused number in that community

#### Scenario: A member is erased
- **WHEN** a person is erased
- **THEN** their membership row remains with its number and its join date

#### Scenario: The members are read afterwards
- **WHEN** a steward reads the community's members
- **THEN** the erased member is among them, as a former member rather than as a gap

#### Scenario: A number is not reused
- **WHEN** somebody joins after an erasure
- **THEN** they are given a new number, not the erased member's

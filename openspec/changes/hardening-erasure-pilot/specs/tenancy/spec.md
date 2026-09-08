## ADDED Requirements

### Requirement: A membership carries a stable local number and survives its person

Every membership MUST carry a number that is unique within its community,
assigned when the membership is created, never reused and never renumbered. The
membership row MUST survive the erasure of the person it belongs to, so that
counts and history stay correct.

A member list MUST show that somebody has left or been erased rather than
silently omitting them.

#### Scenario: A member joins
- **WHEN** a membership is created
- **THEN** it receives the next unused number in that community

#### Scenario: A member is erased
- **WHEN** a person is erased
- **THEN** their membership row remains with its number and its join date

#### Scenario: The member list afterwards
- **WHEN** a steward reads the member list
- **THEN** the erased member appears as a former member rather than disappearing

#### Scenario: A number is not reused
- **WHEN** somebody joins after an erasure
- **THEN** they are given a new number, not the erased member's

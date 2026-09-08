## ADDED Requirements

### Requirement: A self-audit is a recorded act, not a recomputation

Running a self-audit MUST write an immutable record of what was true at that
moment, with who ran it and when. It MUST change no other state. Readiness and
compliance MUST be identical before and after.

#### Scenario: A steward runs a self-audit
- **WHEN** a steward runs it
- **THEN** a dated record is written with the actor
- **AND** no definition, decision, artifact or number changes

#### Scenario: Two people run it on the same state
- **WHEN** two members run a self-audit with nothing changed in between
- **THEN** both snapshots say the same thing

#### Scenario: A member runs it
- **WHEN** a member without permission runs a self-audit
- **THEN** it is refused and no record is written

### Requirement: The snapshot contains what an auditor asks for

A self-audit record MUST contain, as of the moment it ran: whether the community
is compliant; every mandatory artifact missing or incomplete; every countable
clause with no owning definition; every provisional definition with the interim
rule it was adopted under; every definition past its review date; every decision
frozen over an unresolved objection; every live transparency exception with its
expiry; and readiness per layer.

Local definitions past their review date MUST be listed separately and marked as
not affecting compliance.

#### Scenario: A community with gaps
- **WHEN** a self-audit runs on a community with an incomplete artifact, an uncovered clause and a provisional definition
- **THEN** all three appear in the snapshot, each named

#### Scenario: A community with a stale local definition
- **WHEN** a local definition is past its review date
- **THEN** it appears in its own list, marked as not affecting compliance

#### Scenario: A live exception
- **WHEN** a transparency exception is unexpired at the moment of the audit
- **THEN** it appears with its expiry date

### Requirement: Audits accumulate and never change

A self-audit record MUST NOT be editable or deletable. Previous audits MUST stay
listed so a community can see its own trajectory.

#### Scenario: A second audit is run
- **WHEN** a community runs a self-audit a month after its first
- **THEN** both are listed, with their dates and results

#### Scenario: The state changes after an audit
- **WHEN** a definition is adopted after an audit ran
- **THEN** the audit still says what was true when it ran

### Requirement: The public index cites the audit date

The public surface MUST show the date of the most recent self-audit, and MUST say
plainly when there has never been one.

#### Scenario: A community that has audited itself
- **WHEN** the public index is read
- **THEN** it shows the date of the latest self-audit and that the method was self-audit

#### Scenario: A community that has never run one
- **WHEN** the public index is read
- **THEN** it says no self-audit has been recorded, rather than showing nothing

### Requirement: A self-audit is not an approval and not a judgement

The audit MUST be computed from records only. No part of it MUST come from a
model, and it MUST NOT present itself as certification.

#### Scenario: The instance has no AI provider
- **WHEN** a self-audit runs with no provider configured
- **THEN** it produces the same snapshot as it would with one

#### Scenario: The result is shown
- **WHEN** a member reads a self-audit result
- **THEN** nothing on it claims the community has been certified or approved

# visibility Specification

## Purpose
Covers the three levels every community record carries — `member`, `world` and `restricted` — the single helper that expresses what a reader may see and is applied inside the query on every read path, the audience type that makes an anonymous reader unable to borrow a member's context, and the transparency exception that is the only way to restrict something: justified, addressed to a stated audience, authorised by a decision, and ending on a date a job enforces.
## Requirements
### Requirement: Everything is member-visible until a community decides otherwise

Definitions, decisions, documents and community artifacts MUST carry a visibility
of `member`, `world` or `restricted`, defaulting to `member`. "Public" means
public *within the community*: visible to every member, private from no member.

#### Scenario: Something is created
- **WHEN** a definition, decision, document or artifact is created
- **THEN** its visibility is `member`

#### Scenario: An existing community upgrades
- **WHEN** the migration that adds visibility runs
- **THEN** every existing row becomes `member`, and nothing becomes readable to anyone who could not read it before

### Requirement: One filter, in the query, on every read path

There MUST be exactly one helper that expresses what a reader may see, and every
read path MUST apply it inside its query rather than to its results — lists,
detail reads, search indexing, AI context assembly, exports and the git mirror
included.

The helper MUST take an audience rather than a member context, because an
anonymous reader has no membership, no user and no community context to offer. No
anonymous read path MUST construct a member context in order to call a service:
a constructed context would satisfy the ordinary permission checks and grant an
anonymous visitor every read path in the product.

#### Scenario: An anonymous reader lists artifacts
- **WHEN** a reader with no membership reads a community's artifacts
- **THEN** only `world` artifacts are returned

#### Scenario: A member lists artifacts
- **WHEN** a member of the community reads them
- **THEN** `member` and `world` artifacts are returned, and `restricted` ones only if they may see them

#### Scenario: A read service does not use the filter
- **WHEN** a read service returns rows without applying the helper
- **THEN** the enumerating test fails and names the service

#### Scenario: A read service is added without being listed
- **WHEN** a new read path is added and not registered with the enumerating test
- **THEN** the suite fails, rather than covering it by nobody remembering

### Requirement: Restricting something requires an exception that expires

`restricted` MUST NOT be settable on its own. It MUST require a transparency
exception recording what is restricted, **who may see it**, the justification,
who authorised it, the decision that authorised it, and an expiry date. The
expiry MUST NOT be optional, and neither MUST the audience.

The subject and its exception MUST be written in one transaction, so a restricted
subject without a justification cannot exist.

#### Scenario: A steward restricts an artifact
- **WHEN** an artifact is set to `restricted` with a justification, an authorising decision and an expiry
- **THEN** both the visibility and the exception are stored

#### Scenario: A restricted subject is read by someone outside its audience
- **WHEN** a member who is not in the exception's stated audience reads it
- **THEN** the answer is the same as for a subject that does not exist

#### Scenario: A steward restricts something with no justification or no expiry
- **WHEN** either is missing
- **THEN** it is refused and the visibility is unchanged

#### Scenario: An exception is written and the visibility write fails
- **WHEN** any part of the act fails
- **THEN** neither the exception nor the restricted visibility exists

### Requirement: An exception ends by itself, visibly

A job MUST revert subjects whose exception has expired to `member` visibility and
MUST write a change-log entry for each. Restriction MUST NOT be able to continue
silently past its stated end.

#### Scenario: An exception expires
- **WHEN** the job runs after an exception's expiry date
- **THEN** the subject becomes `member`-visible again
- **AND** a change-log entry records that the exception expired

#### Scenario: An exception is renewed before it expires
- **WHEN** a steward extends an exception with a new expiry and justification
- **THEN** the subject stays restricted and both the old and new justifications remain readable

#### Scenario: A community reviews what it is hiding
- **WHEN** a steward lists the community's exceptions
- **THEN** each shows its subject, justification, authorising decision and expiry date

### Requirement: Restricted content is still auditable

An exception MUST NOT hide a subject from compliance accounting. A restricted
definition still answers its clause, still counts toward readiness, and still
appears in the self-audit.

#### Scenario: A restricted definition answers a clause
- **WHEN** a definition whose visibility is `restricted` is adopted
- **THEN** readiness counts it exactly as it would a member-visible one

#### Scenario: The self-audit runs with exceptions live
- **WHEN** a self-audit runs
- **THEN** every live exception and its expiry appears in the snapshot

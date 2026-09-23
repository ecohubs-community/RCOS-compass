## ADDED Requirements

### Requirement: A definition has one derived status, shown the same everywhere

The system SHALL derive a definition's status from its facts — whether a version
is adopted, whether a draft exists, whether a discussion on it is open, whether a
consent round on it is open, and whether its review date has passed — as one of
`not_started`, `drafting`, `in_discussion`, `in_round`, `adopted` or
`needs_review`. The definition page, the definitions index and the Standard
browser MUST show the same status for the same definition. An adopted definition
with an open discussion MUST remain `adopted`, marked as under discussion.
Provisional MUST remain a separate flag.

#### Scenario: A draft with no discussion
- **WHEN** a definition has a draft and no adopted version and no open discussion
- **THEN** its status is drafting

#### Scenario: A round is open
- **WHEN** a consent round on its current proposal is open
- **THEN** its status is in a round

#### Scenario: Adopted and being rediscussed
- **WHEN** an adopted definition has an open discussion proposing a change
- **THEN** its status is adopted, marked as under discussion, not drafting

#### Scenario: Review date passed
- **WHEN** an adopted definition's review date is in the past
- **THEN** its status is needs review

#### Scenario: The same everywhere
- **WHEN** one definition is shown on its page, in the index and in the Standard browser
- **THEN** all three show the same status

### Requirement: The definition page shows how the community got here

The definition page SHALL show, beside the text: the discussions about it with
their message counts, the open proposal if any, the decision behind the adopted
version (reference, mechanism, tally, date decided, review date, and whether
provisional), its earlier versions, related definitions, and confirmed evidence
for the clauses it answers. Discussions about it MUST include those opened on
the definition and those opened on any clause it answers. Nothing from another
community MUST appear.

#### Scenario: The decision is shown
- **WHEN** a member opens an adopted definition
- **THEN** the column shows its decision reference, mechanism, tally, decided date and review date
- **AND** the reference links to the register entry

#### Scenario: A thread opened on the clause is found
- **WHEN** a discussion was opened on a clause before the definition answering it existed
- **THEN** that discussion is listed on the definition's page

#### Scenario: A thread matched both ways is listed once
- **WHEN** a discussion is linked to the definition and also to a clause it answers
- **THEN** it appears once

#### Scenario: Not yet adopted
- **WHEN** a definition has no adopted version
- **THEN** the column shows its discussions and open proposal and says no decision yet, rather than an empty block

#### Scenario: Another community's discussion
- **WHEN** another community has a discussion on the same clause key
- **THEN** it does not appear

### Requirement: Earlier versions are listed with the decision that adopted each

The definition page SHALL list every adopted version of the definition, newest
first, each with its number, adoption date and the decision reference that
adopted it. The currently authoritative version MUST be marked.

#### Scenario: Three versions
- **WHEN** a definition has been frozen three times
- **THEN** v3, v2 and v1 are listed with their dates and decision references, v3 marked current

#### Scenario: One version
- **WHEN** a definition has only v1
- **THEN** v1 is listed and marked current

### Requirement: Related definitions come from the standard's own references

The definition page SHALL list related definitions derived from the clauses the
standard marks as referencing or depended on by the clauses this definition
answers, resolved to the definitions answering them in this community. A related
section with no definition yet MUST be shown as not written yet, linking to its
clause.

#### Scenario: A referenced clause is answered
- **WHEN** a clause this definition answers is referenced by a clause another definition answers
- **THEN** that other definition is listed as related

#### Scenario: A related section is not answered
- **WHEN** a related clause's section has no definition yet
- **THEN** it is listed as not written yet, linking to the clause

### Requirement: Definitions have an index of their own

The system SHALL provide a definitions index listing every definition in the
community — answering the standard and local — with its artifact, section
reference, current version, derived status, provisional flag and when it last
changed and by whom. It MUST offer filters by status, by artifact, *needs my
attention* and *provisional*, and MUST have its own navigation entry distinct
from the Standard browser. Below 768px each row MUST become a card.

#### Scenario: Filtering by provisional
- **WHEN** a member filters to provisional
- **THEN** only provisional definitions are listed

#### Scenario: Needs my attention
- **WHEN** a member is eligible in an open round on a definition and has not answered
- **THEN** that definition appears under needs my attention for them and not for a member who has answered

#### Scenario: Local definitions are listed
- **WHEN** the community has local definitions
- **THEN** they appear in the index, labelled local

#### Scenario: Separate from the Standard browser
- **WHEN** a member is on the definitions index
- **THEN** only the Definitions navigation entry is marked current

#### Scenario: Another community
- **WHEN** another community's definitions exist
- **THEN** none appear

### Requirement: A member can create a local definition

A member or steward SHALL be able to create a local definition from the
definitions index, giving a title, a layer and a purpose, and optionally
attaching it to an artifact, naming the clauses it touches, and marking that the
standard should require this, which MUST record it as the community's feedback on
the standard. The layer MUST be required. Creating one MUST NOT adopt anything: the new definition has no
adopted version until a freeze.

#### Scenario: A member creates one
- **WHEN** a member creates "Thursday dinner" in layer 5 with a purpose
- **THEN** it exists as a local definition with no adopted version, and they are recorded as having asked for it

#### Scenario: The standard should have asked
- **WHEN** a member creates a local definition marked "RCOS should require this"
- **THEN** it appears on the community's feedback on the standard, attributed to them

#### Scenario: Layer missing
- **WHEN** the form is submitted without a layer
- **THEN** it is refused with the reason and nothing is created

#### Scenario: Touched clauses are not satisfied
- **WHEN** a local definition names two clauses it touches
- **THEN** its page says it touches them and satisfies neither
- **AND** no readiness or completeness figure changes

#### Scenario: A suspended community
- **WHEN** a member of a suspended community tries to create one
- **THEN** it is refused

### Requirement: A local definition can be discussed and frozen

A discussion SHALL be openable on a local definition, and freezing a proposal in
that discussion MUST adopt a new version of that same definition through the
ordinary decision path. A discussion on an open question MUST still refuse to
freeze.

#### Scenario: A local rule is adopted
- **WHEN** a steward freezes a proposal in a discussion opened on a local definition
- **THEN** that definition gains a new adopted version with its decision

#### Scenario: The clause path is unchanged
- **WHEN** a steward freezes a proposal in a discussion opened on a clause
- **THEN** the definition answering that clause's section is created or versioned exactly as before

### Requirement: A local definition's page says why it exists

A local definition's page SHALL show, in place of the standard's requirement,
why the community made the rule (its purpose), who asked for it, when it was
first written down, and whether it is kept out of the public index. It MUST NOT
show an empty column.

#### Scenario: The why is shown
- **WHEN** a member opens a local definition with a purpose
- **THEN** the left column is headed as why the rule was made and shows the purpose, who asked for it and when v1 was adopted

#### Scenario: Kept internal
- **WHEN** the local definition is member-visible only
- **THEN** its page says it is kept out of the public index

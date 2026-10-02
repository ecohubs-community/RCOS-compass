# definitions Specification

## Purpose
Covers the text a community writes: what a definition may answer and what a local one may not move, how a frozen version stays authoritative while drafts accumulate on top of it, how concurrent editing is resolved without losing work, and how authored text is rendered inert.
## Requirements
### Requirement: A definition answers one section, or nothing at all

A definition MUST carry a scope of `standard` or `local`. A `standard` definition
MUST name exactly one section of an adopted standard, and a community MUST NOT
hold two of them for the same section. A `local` definition MUST NOT name a
section.

#### Scenario: A second definition for the same section
- **WHEN** a definition is created for a section that already has one
- **THEN** it is refused, and the existing definition is offered instead

#### Scenario: A community writes many local definitions
- **WHEN** several local definitions are created in one community
- **THEN** all are stored, because none of them names a section

#### Scenario: A local definition names a section
- **WHEN** a definition with scope `local` is given a section key
- **THEN** it is refused

### Requirement: A local definition moves no number

A local definition MUST NOT change readiness or compliance in either direction,
and MUST NOT complete or block a mandatory artifact.

#### Scenario: A local definition is adopted
- **WHEN** a community adopts a local definition
- **THEN** readiness is unchanged
- **AND** compliance is unchanged

#### Scenario: A local definition is left unwritten
- **WHEN** a community's local artifact has no definitions at all
- **THEN** no artifact is reported incomplete because of it

#### Scenario: A local definition is attached to an RCOS artifact
- **WHEN** a local definition extends an artifact the standard defines
- **THEN** it is listed under that artifact
- **AND** the artifact's completeness is computed without it

### Requirement: A frozen version stays authoritative until the next freeze

A definition version MUST be immutable once frozen. Editing a definition MUST
create a draft on top of the frozen version, and the frozen version MUST remain
the one shown and exported until a new freeze replaces it.

#### Scenario: Editing an adopted definition
- **WHEN** a member edits a definition that has an adopted version
- **THEN** a draft is created
- **AND** readers still see the adopted version

#### Scenario: A frozen version is edited directly
- **WHEN** a write is attempted against a frozen version's text
- **THEN** it is refused

### Requirement: Concurrent editing does not silently lose work

A draft MUST carry an edit token issued when it was loaded. A save presenting a
stale token MUST NOT overwrite, and MUST tell the editor who else is editing and
what changed.

#### Scenario: Two members edit the same draft
- **WHEN** the second member saves with the token they loaded
- **THEN** the save is refused
- **AND** they are shown the other editor and offered keep mine, take theirs, or merge by hand

#### Scenario: A single editor saves repeatedly
- **WHEN** the same editor autosaves several times in a row
- **THEN** every save succeeds, each with the token the previous save returned

### Requirement: A community can record what the standard should have asked

Creating a local definition MUST offer to record it as feedback on the standard,
and that record MUST NOT be sent anywhere without a deliberate act.

#### Scenario: The feedback box is ticked
- **WHEN** a local definition is created with "RCOS should require this" ticked
- **THEN** a standard-feedback entry is stored with the community's own text

#### Scenario: Nothing leaves the instance
- **WHEN** a standard-feedback entry exists
- **THEN** no request is made to any external service

### Requirement: Text a member wrote is rendered inert

Text a member authors MUST render without executing anything it contains, and no
component MUST pass externally-sourced text to a raw-HTML sink. This covers a
definition body, a plain-language block, a proposal and a post alike.

#### Scenario: A body carries a script payload
- **WHEN** a definition body contains an image tag with an error handler, a `javascript:` link, and a Markdown image whose source is a script URL
- **THEN** the rendered page executes none of them
- **AND** the visible text is still readable

#### Scenario: The codebase is swept
- **WHEN** the source is searched for raw-HTML rendering
- **THEN** no occurrence receives text that came from a request, a database row, or a model

### Requirement: A version records how it was written

A definition version MUST record whether it was drafted with AI assistance and
the linter result at the time it was frozen. The stored result MUST be the
per-line one, carrying each line's job and the findings against it, so that a
reader later can see not only that the linter disagreed but with which line.

A version's type MUST be the primary job derived from that result, and MUST NOT
be a value the author chose for the whole body.

Where a definition's text began — a passage from a document the community
uploaded, or nothing — MUST also be recorded, because it is part of what a reader
a year later needs and cannot be reconstructed afterwards.

#### Scenario: A version is frozen
- **WHEN** a definition version is adopted
- **THEN** it stores its per-line linter result and whether AI assisted it
- **AND** its type is the primary job derived from that result

#### Scenario: The linter disagrees with the community
- **WHEN** a definition with unresolved linter warnings is frozen
- **THEN** the freeze succeeds and the warnings are stored with the version
- **AND** each stored warning names the line it was about

#### Scenario: A version frozen before the linter ran per line
- **WHEN** a version stored before this change is read
- **THEN** its result is shown as it was recorded
- **AND** the annotated view is unavailable for it rather than fabricated

#### Scenario: An author supplies a type
- **WHEN** a draft is submitted carrying a type for the whole body
- **THEN** it is ignored, and the derived primary job is stored

#### Scenario: A definition began as the community's own document
- **WHEN** a draft pre-filled from confirmed evidence is frozen
- **THEN** the definition still records the evidence its text came from
- **AND** the reader can reach the passage and the document behind it

#### Scenario: A definition was typed from nothing
- **WHEN** a draft written by hand is frozen
- **THEN** no origin is recorded, rather than an empty one

### Requirement: The linter's assisted rules stay silent rather than guess

The two rules the linter cannot decide from text alone MUST be answered by a
provider or not at all. Without one — no provider configured, the provider
failing, or a budget exhausted — the panel MUST say the check was not run. It
MUST NOT report the definition as having passed a check nobody performed.

#### Scenario: A provider is available
- **WHEN** a definition is linted with a provider configured and in budget
- **THEN** the assisted findings appear alongside the rule-based ones

#### Scenario: No provider is configured
- **WHEN** a definition is linted with the `null` provider
- **THEN** every rule-based finding still appears
- **AND** the assisted checks are reported as not run, not as passed

#### Scenario: The member is out of budget
- **WHEN** a member who has spent their AI budget lints a definition
- **THEN** the result is the same as having no provider
- **AND** the rule-based findings are unaffected

#### Scenario: The linter is still advice
- **WHEN** an assisted finding says an auditor could not check the definition
- **THEN** the community may still freeze it
- **AND** the finding is stored with the version

### Requirement: A community can read back what it asked the standard for

Every member of a community MUST be able to read the feedback on the standard
that the community has recorded, newest first, each entry showing its words, the
standard and version it concerns, the clause ref where one was named, a link to
the definition or clause it came from, who recorded it and when. The list MUST
contain only the reader's own community's entries, MUST NOT contain an entry
whose definition the reader may not see, and MUST name every person through the
same label as every other surface, so an erased author reads as a former member.

#### Scenario: A member opens the list
- **WHEN** a member opens *Feedback on the standard* in their community's settings
- **THEN** every entry the community recorded is listed, newest first, with its words, who recorded it and when
- **AND** each entry links to the definition it came from

#### Scenario: Nothing has been recorded
- **WHEN** a community has recorded no feedback on the standard
- **THEN** the page says so and says how an entry is recorded

#### Scenario: Another community's feedback
- **WHEN** a member of one community reads the list
- **THEN** no entry recorded by another community appears

#### Scenario: A reader without the read permission
- **WHEN** somebody whose role does not hold `community.read` asks for the list
- **THEN** it is refused and nothing is returned

#### Scenario: The definition is restricted from the reader
- **WHEN** an entry's definition is restricted and the reader may not see restricted content
- **THEN** that entry is not listed

#### Scenario: The author has been erased
- **WHEN** the person who recorded an entry has been erased
- **THEN** the entry is still listed and names them as a former member, never by name

#### Scenario: A narrow phone
- **WHEN** the page is opened at 375 pixels wide
- **THEN** every entry is readable without horizontal scrolling

### Requirement: A definition has one derived status, shown the same everywhere

The system SHALL derive a definition's status from its facts — whether a version
is adopted, whether a draft exists, whether a discussion on it is open, whether a
consent round on it is open, and whether its review date has passed — as one of
`not_started`, `drafting`, `in_discussion`, `in_vote`, `adopted` or
`needs_review`. The definition page, the definitions index and the Standard
browser MUST show the same status for the same definition. An adopted definition
with an open discussion MUST remain `adopted`, marked as under discussion.
Provisional MUST remain a separate flag.

#### Scenario: A draft with no discussion
- **WHEN** a definition has a draft and no adopted version and no open discussion
- **THEN** its status is drafting

#### Scenario: A round is open
- **WHEN** a consent round on its current proposal is open
- **THEN** its status is in vote

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
the definition and those that answer its section — named directly, or through a
clause the section owns — by the same rule the Path and the freeze use. Nothing
from another community MUST appear.

#### Scenario: The decision is shown
- **WHEN** a member opens an adopted definition
- **THEN** the column shows its decision reference, mechanism, tally, decided date and review date
- **AND** the reference links to the register entry

#### Scenario: A thread opened on the clause is found
- **WHEN** a discussion was opened on a clause before the definition answering it existed
- **THEN** that discussion is listed on the definition's page

#### Scenario: A thread started from the Path is found
- **WHEN** a discussion was started from the Path item for a section that owns no clause, and frozen
- **THEN** that discussion is listed on the definition it created

#### Scenario: A thread on a clause this section only references
- **WHEN** a discussion answers another section that cites one of this definition's clauses
- **THEN** it is not listed on this definition's page

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

#### Scenario: A restricted definition
- **WHEN** a definition is restricted to stewards under a transparency exception
- **THEN** a member's index does not list it, and a steward's does

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
why the community made the rule (its purpose), the community's adopted
definitions in the same layer for context, who asked for it, when it was first
written down, and whether it is kept out of the public index. It MUST NOT show
an empty column.

#### Scenario: The why is shown
- **WHEN** a member opens a local definition with a purpose
- **THEN** the left column is headed as why the rule was made and shows the purpose, who asked for it and when v1 was adopted

#### Scenario: Kept internal
- **WHEN** the local definition is member-visible only
- **THEN** its page says it is kept out of the public index


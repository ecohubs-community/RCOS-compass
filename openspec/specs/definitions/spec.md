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


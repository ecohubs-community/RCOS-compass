## MODIFIED Requirements

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

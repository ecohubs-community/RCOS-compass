## MODIFIED Requirements

### Requirement: Every member can read an uploaded document, and the upload says so

A document MUST be readable by every member of the community that owns it,
because any member may map its passages. The upload control MUST state that
before a file is chosen. Deleting a document MUST remove its row, its passages
and the file itself.

A document MUST also carry a visibility, defaulting to `member`. A document that
is not `world` MUST NOT be reachable from any anonymous surface, MUST NOT appear
in an export made by somebody who may not see it, and MUST NOT be committed to
the git mirror.

#### Scenario: A member opens a document somebody else uploaded
- **WHEN** a member who did not upload a document opens it
- **THEN** its passages and its file are served

#### Scenario: A member is about to upload
- **WHEN** the upload control is shown
- **THEN** it states that every member of the community will be able to read the file

#### Scenario: A document is deleted
- **WHEN** a document is deleted
- **THEN** its row, its passages and the stored file are all gone
- **AND** evidence that pointed at its passages is `stale` rather than dangling

#### Scenario: An anonymous visitor requests a member-visible document
- **WHEN** the file or its passages are requested with no session
- **THEN** the answer is the same as for a document that does not exist

#### Scenario: A community exports with an uploaded document
- **WHEN** a bundle is produced
- **THEN** it contains only documents the exporter may see

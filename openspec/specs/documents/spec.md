# documents Specification

## Purpose
Covers the files a community uploads: what is validated before anything is kept, how uploading is rate-limited and capped per member and per community, how extraction runs as a job that reports its own outcome, how a scan is reported as unreadable rather than empty, and why every member of the owning community can read what was uploaded.
## Requirements
### Requirement: A file is validated before any of it is kept

The application MUST check declared extension and sniffed content against the
allowlist, and MUST enforce the size ceiling, before writing the file to its
final location. A rejected upload MUST leave no file and no row.

Accepted: `.pdf` `.docx` `.odt` `.md` `.txt`, where extension and sniffed type
agree. Rejected: anything executable or archive-shaped, a file whose sniffed type
contradicts its extension, an encrypted PDF, and anything over the size ceiling.

#### Scenario: A member uploads their bylaws as a PDF
- **WHEN** a member uploads a PDF within the size ceiling
- **THEN** a document row is created for their community
- **AND** the file is stored under that community's directory

#### Scenario: A file is renamed to get past the allowlist
- **WHEN** an executable is uploaded as `bylaws.pdf`
- **THEN** it is refused because the sniffed type contradicts the extension
- **AND** no file and no document row exist afterwards

#### Scenario: A file exceeds the size ceiling
- **WHEN** an upload passes the configured maximum
- **THEN** it is refused without the whole file being held in memory
- **AND** no partial file is left behind

#### Scenario: A zip-shaped document is a bomb
- **WHEN** a docx whose decompressed size exceeds the ceiling is uploaded
- **THEN** it is refused as a zip bomb
- **AND** no passages and no partial rows exist afterwards

### Requirement: Uploading is rate-limited per member and per community

The application MUST limit uploads per user per hour and per day, and per
community per day, and MUST cap total stored bytes per community. A refusal MUST
say which limit was reached.

#### Scenario: One member uploads repeatedly
- **WHEN** a member passes their hourly upload limit
- **THEN** further uploads are refused with the limit named
- **AND** other members of the same community can still upload

#### Scenario: A community reaches its storage ceiling
- **WHEN** a community's stored bytes would exceed its ceiling
- **THEN** the upload is refused and nothing is written

### Requirement: Extraction runs as a job and reports its own outcome

Text extraction MUST run outside the request, under a wall-clock timeout, and the
document's status MUST record the outcome. A document MUST never be left in a
state that claims text it does not have.

Status moves `uploaded` → `extracting` → one of `extracted`, `reference_only` or
`failed`.

#### Scenario: A readable document is extracted
- **WHEN** extraction succeeds
- **THEN** the document's status is `extracted`
- **AND** its passages are readable by members of that community

#### Scenario: Extraction runs out of time
- **WHEN** extraction passes its wall-clock ceiling
- **THEN** the document's status is `failed` with a reason a member can read
- **AND** no partial passages are left behind

#### Scenario: A document is longer than the extraction ceiling
- **WHEN** a document exceeds the maximum extracted pages
- **THEN** the pages up to the ceiling are extracted
- **AND** the remainder is reported as not extracted, rather than dropped silently

### Requirement: A scan is reported as unreadable, never as empty

A PDF with no text layer MUST be accepted as a file and reported as unreadable.
The application MUST NOT present zero extracted passages as though the document
contained nothing.

#### Scenario: A member uploads a scanned PDF
- **WHEN** a PDF has no text layer
- **THEN** the document's status is `reference_only`
- **AND** the member is told the file looks like a scan and cannot be read
- **AND** the file remains downloadable by members of that community

### Requirement: Every member can read an uploaded document, and the upload says so

A document MUST be readable by every member of the community that owns it,
because any member may map its passages. The upload control MUST state that
before a file is chosen. Deleting a document MUST remove its row, its passages
and the file itself.

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

### Requirement: A document belongs to one community

A document, its passages and its file MUST be reachable only from inside the
community that owns it.

#### Scenario: A member reads their community's document
- **WHEN** a member opens a document belonging to their community
- **THEN** its passages and its file are served

#### Scenario: A member of another community requests it
- **WHEN** a steward of community B requests a document belonging to A, by id
- **THEN** the answer is the same as for a document that does not exist
- **AND** the file is not served

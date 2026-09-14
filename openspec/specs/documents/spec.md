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

Text extraction MUST run outside the request, in an isolated worker that is
terminated at a wall-clock deadline and held under a memory ceiling, and the
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

#### Scenario: A file that never finishes parsing
- **WHEN** parsing a file does not yield before the deadline
- **THEN** the worker parsing it is terminated at the deadline
- **AND** the document's status is `failed` with the deadline reason

#### Scenario: A file that exhausts memory
- **WHEN** parsing a file passes the extraction memory ceiling
- **THEN** the document's status is `failed` with a reason a member can read
- **AND** the job worker process keeps running

#### Scenario: A document is longer than the extraction ceiling
- **WHEN** a document exceeds the maximum extracted pages
- **THEN** the pages up to the ceiling are extracted
- **AND** the remainder is reported as not extracted, rather than dropped silently

#### Scenario: A document read before is read again and fails
- **WHEN** a document with passages and confirmed evidence is extracted again and the result is `failed` or `reference_only`
- **THEN** its previous passages and their search entries are gone
- **AND** the evidence that pointed at them is `stale`

#### Scenario: The file cannot be reached
- **WHEN** extraction cannot be attempted because the file is missing from storage or a parser cannot be loaded
- **THEN** the document is not reported as damaged, and no reader version is recorded against it
- **AND** a document that had passages keeps them, its evidence unchanged

#### Scenario: A zip declares more bytes than it holds
- **WHEN** an OpenDocument file's entry declares a compressed size larger than the file itself
- **THEN** extraction refuses the entry as unreadable without allocating the declared size

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
because any member may map its passages. The upload control MUST state, before a
file is chosen, that every member of the community will be able to read the files
and that nothing is published outside the community, naming the community.
Deleting a document MUST remove its row, its passages and the file itself.

A document MUST also carry a visibility, defaulting to `member`. A document MUST
NOT be published and MUST NOT be given `world` visibility; an attempt to do either,
by any path, MUST be refused and change nothing. A document MUST NOT be reachable
from any anonymous surface, MUST NOT appear in an export made by somebody who may
not see it, and MUST NOT be committed to the git mirror.

#### Scenario: A member opens a document somebody else uploaded
- **WHEN** a member who did not upload a document opens it
- **THEN** its passages and its file are served

#### Scenario: A member is about to upload
- **WHEN** the upload control is shown for Valle Verde
- **THEN** it reads "Every member of Valle Verde will be able to read these files. Nothing is published outside the community."

#### Scenario: A document is deleted
- **WHEN** a document is deleted
- **THEN** its row, its passages and the stored file are all gone
- **AND** evidence that pointed at its passages is `stale` rather than dangling

#### Scenario: An anonymous visitor requests a member-visible document
- **WHEN** the file or its passages are requested with no session
- **THEN** the answer is the same as for a document that does not exist

#### Scenario: A steward tries to publish a document
- **WHEN** a steward publishes a document subject through the service or a crafted publishing form
- **THEN** it is refused with a sentence saying uploaded documents stay inside the community
- **AND** the document's visibility is unchanged

#### Scenario: A document in a batch with definitions
- **WHEN** a publish of several subjects includes one document
- **THEN** nothing in the batch is published

#### Scenario: A community exports with an uploaded document
- **WHEN** a bundle is produced
- **THEN** it contains no uploaded documents

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

### Requirement: Passages are paragraphs, and a PDF passage knows where it is

Extraction MUST divide a document into paragraphs and headings, not into pages.
For a PDF, a paragraph boundary MUST be found from the layout of the text — the
vertical gap between lines, a change in font size, indentation and columns —
rather than from blank lines in joined text. Each PDF passage MUST record the box
of each of its lines on its page, with the range of the passage text that line
carries. Word, OpenDocument and Markdown passages MUST record which of them are
headings. Every extraction MUST record the version of the reader that produced it.

#### Scenario: A PDF page with several paragraphs
- **WHEN** a PDF page whose text holds three paragraphs separated by vertical space is extracted
- **THEN** three passages exist for that page, in reading order
- **AND** each records one box per line it spans, and the line ranges together cover its text

#### Scenario: A PDF whose text has no blank lines between paragraphs
- **WHEN** a PDF is extracted whose text content separates lines only by line ends
- **THEN** it is divided into paragraphs, not into one passage per page

#### Scenario: A heading in a PDF
- **WHEN** a short line set noticeably larger than the body text is extracted
- **THEN** it becomes a passage of kind `heading`

#### Scenario: A two-column page
- **WHEN** a page laid out in two columns is extracted
- **THEN** every passage of the left column precedes every passage of the right column

#### Scenario: A hyphenated line break
- **WHEN** a paragraph breaks a word across two lines with a hyphen
- **THEN** the passage text contains the word whole

#### Scenario: A Word document with headings
- **WHEN** a `.docx` with heading styles is extracted
- **THEN** its headings become passages of kind `heading` and its body paragraphs of kind `paragraph`
- **AND** no HTML from the document is stored

#### Scenario: A non-PDF passage
- **WHEN** a Markdown, plain-text, Word or OpenDocument file is extracted
- **THEN** its passages carry no line boxes

### Requirement: Documents read by an older reader are read again

The application MUST extract again, with the current reader and without anybody
asking, every document extracted by an earlier reader version or whose extraction
failed under one.
Evidence pointing at the passages it replaces MUST become `stale`.

#### Scenario: A document from before paragraphs
- **WHEN** the application starts with a document extracted by the previous reader
- **THEN** it is extracted again, and its passages and reader version are the current reader's

#### Scenario: Claims on an old document
- **WHEN** a re-read replaces passages that evidence pointed at
- **THEN** that evidence is `stale` and still readable

#### Scenario: Documents already current
- **WHEN** the application starts and every document was read by the current reader
- **THEN** nothing is re-read

### Requirement: The size ceiling is the only upload size limit a member meets

A file within the configured upload ceiling MUST be accepted by the running
production server as far as the application's own validation. The server's request
body limit MUST NOT be lower than the upload ceiling plus the form around it, and
the application MUST refuse to start in production when it is.

#### Scenario: A five-megabyte PDF on the production build
- **WHEN** a member uploads a valid 5 MB PDF to the built server with the default ceiling
- **THEN** a document row is created

#### Scenario: A deployment with the body limit below the ceiling
- **WHEN** the production server starts with a request body limit smaller than the upload ceiling
- **THEN** it refuses to start with a message naming both values

### Requirement: A document's file can be replaced, and the previous file is kept

A member who may upload MUST be able to replace a document's file with a newer
one. The replacement MUST pass the same validation, rate limits and storage
ceiling as an upload. The document MUST keep its identity. The previous file MUST
be kept as a version recording who uploaded it, when, and who replaced it. The
document's passages MUST be replaced by the new file's, evidence on the old
passages MUST become `stale`, and its scan and "mapping done" state MUST be reset.
Replacing with byte-identical content MUST be refused.

#### Scenario: A member uploads the 2024 bylaws over the 2019 ones
- **WHEN** a member replaces a document's file with a valid newer file
- **THEN** the document keeps its id and its place in the library
- **AND** the 2019 file is listed as a previous version, downloadable
- **AND** its passages come from the 2024 file once extraction completes
- **AND** evidence that pointed at old passages is `stale`, still readable

#### Scenario: The replacement is refused by validation
- **WHEN** the replacement file fails the allowlist or the size ceiling
- **THEN** the document, its passages, its evidence, its versions and its file are unchanged

#### Scenario: The same file again
- **WHEN** a replacement has the same content hash as the current file
- **THEN** it is refused with a sentence saying it is the same file

#### Scenario: Versions count toward the storage ceiling
- **WHEN** a replacement would take the community's current files plus versions over its storage ceiling
- **THEN** it is refused, naming the ceiling, and nothing changes

#### Scenario: A member without upload permission
- **WHEN** a member without `document.upload` submits a replacement
- **THEN** it is refused and nothing changes

#### Scenario: Replacing a document in another community
- **WHEN** a member of community B submits a replacement for a document of community A, by id
- **THEN** the answer is the same as for a document that does not exist

### Requirement: An earlier version can be restored, and only a steward can delete one

A member who may upload MUST be able to restore a previous version, which MUST
behave as a replacement by that version's file: the current file becomes a
version, and the restored file becomes current without copying its bytes. A
steward MUST be able to delete a previous version, which MUST remove its row and
its file. Deleting a document MUST remove every version's row and file.

#### Scenario: A mistaken replacement is undone
- **WHEN** a member restores the 2019 version after a mistaken replacement
- **THEN** the 2019 file is current and the mistaken file is a previous version
- **AND** the document's passages are re-extracted from the 2019 file

#### Scenario: A member tries to delete a version
- **WHEN** a member without `document.destroy` deletes a previous version
- **THEN** it is refused and the version and its file remain

#### Scenario: A steward deletes a version
- **WHEN** a steward deletes a previous version
- **THEN** its row and its stored file are gone, and the current file is untouched

#### Scenario: A document with versions is removed
- **WHEN** a steward removes a document that has two previous versions
- **THEN** the document, its passages, both version rows and all three files are gone

#### Scenario: A version file is requested from outside
- **WHEN** a previous version's file is requested with no session, or by a member of another community
- **THEN** the answer is the same as for a document that does not exist

#### Scenario: The uploader of a version is erased
- **WHEN** a member who uploaded or replaced a version is erased
- **THEN** the version remains and no longer names them


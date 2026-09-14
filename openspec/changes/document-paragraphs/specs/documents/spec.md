## ADDED Requirements

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

## MODIFIED Requirements

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

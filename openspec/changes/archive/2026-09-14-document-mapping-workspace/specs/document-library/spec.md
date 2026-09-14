## ADDED Requirements

### Requirement: Every document shows one mapping state, derived from what exists

Each document MUST show exactly one of *Reading*, *Couldn't be read*, *Can't be
scanned*, *Scanning*, *Not scanned*, *Not governance*, *Mapping in progress* or
*Mapped*. The state MUST be derived from the document's extraction status, scan
state, "mapping done" mark and non-stale evidence, and MUST NOT be stored as a
state of its own.

A paragraph passage is **identified** when it has at least one non-stale evidence
row, suggested by a model or mapped by a person, and **open** when at least one of
those rows is `suggested`.

- *Not scanned*: no passage is identified and no scan has run.
- *Not governance*: the scan is complete and no passage is identified.
- *Mapped*: at least one passage is identified, none is open, and either the scan
  is complete or a member has marked mapping as done.
- *Mapping in progress*: any other extracted document with a scan or an
  identified passage.

#### Scenario: A finished scan with everything answered
- **WHEN** a document's scan is complete and each of its 9 identified passages has been confirmed or dismissed
- **THEN** the document shows *Mapped*

#### Scenario: A finished scan that found nothing
- **WHEN** a document's scan is complete and no passage was identified
- **THEN** the document shows *Not governance*

#### Scenario: One suggestion still waiting
- **WHEN** a scan is complete and one identified passage still has a `suggested` row
- **THEN** the document shows *Mapping in progress*

#### Scenario: One paragraph mapped by hand
- **WHEN** a member maps one paragraph of an unscanned document by hand
- **THEN** the document shows *Mapping in progress*, not *Mapped*

#### Scenario: Marked as done after mapping by hand
- **WHEN** a member marks mapping as done on an unscanned document with three confirmed hand mappings
- **THEN** the document shows *Mapped*

#### Scenario: Marking done while something is open
- **WHEN** a member tries to mark mapping as done while a suggestion is open or a scan is live
- **THEN** it is refused and the state is unchanged

#### Scenario: A new scan after marking done
- **WHEN** a scan is started on a document marked as done
- **THEN** the mark is cleared and the document is not *Mapped* until it is complete or marked again

#### Scenario: A stopped scan with nothing open
- **WHEN** a scan stopped on a budget, every suggestion so far is answered and nobody marked it done
- **THEN** the document shows *Mapping in progress*

#### Scenario: Stale claims after a replacement
- **WHEN** a replaced document's only evidence is `stale`
- **THEN** it shows *Not scanned* once extracted

### Requirement: The library says how far each document is, and how much language the community already has

The library MUST show, per document, its type, its size, its page count when it
has pages, when and by whom it was added, its mapping state, and — once anything
is identified — "N of M passages mapped", where M is identified passages and N
those not open, with how many of its claims became definitions. The library MUST
show the community's count of requirements with confirmed language, separately
from readiness. It MUST offer filters for all documents, not mapped (*Not
scanned*) and mapped (*Mapping in progress* and *Mapped*), each with its count,
kept in the URL.

#### Scenario: A document mid-mapping
- **WHEN** a document has 23 identified passages of which 14 are not open
- **THEN** its row reads "14 of 23 passages mapped" with a bar at that proportion

#### Scenario: Claims that became definitions
- **WHEN** three of a document's confirmed claims were turned into definitions
- **THEN** its row says three became definitions

#### Scenario: The coverage count
- **WHEN** confirmed evidence covers 38 of the community's 187 countable requirements
- **THEN** the library reads that 38 of 187 requirements already have language
- **AND** readiness is unchanged by it

#### Scenario: Counts ignore other communities
- **WHEN** another community has documents and confirmed evidence
- **THEN** none of it contributes to this library's rows, counts, filters or coverage

#### Scenario: The uploader was erased
- **WHEN** the member who uploaded a document has been erased
- **THEN** the row attributes the upload the way erasure specifies, and not by their former name

#### Scenario: Filtering
- **WHEN** a member chooses the mapped filter
- **THEN** only documents in *Mapping in progress* or *Mapped* are listed, and the URL carries the filter

### Requirement: Each document offers the next thing to do, within the member's permissions

Each row MUST offer one primary action for its state: *Start RCOS mapping* when
not scanned (or *Map by hand* when a scan is unavailable), *Continue mapping* when
in progress, *Review mapping* when mapped, and *Open document* otherwise. A row
menu MUST offer *Start RCOS mapping*, *Open document*, *Replace with a newer file*,
*Previous versions* and *Remove from library*, each only to a member permitted to
do it. Removing MUST ask for confirmation naming how many confirmed claims will
become stale and how many versions will be deleted.

#### Scenario: AI unavailable on a not-scanned document
- **WHEN** AI is unavailable and a document is *Not scanned*
- **THEN** *Start RCOS mapping* is disabled with the reason and the primary action is *Map by hand*

#### Scenario: A member views the menu
- **WHEN** a member without `document.destroy` opens a row's menu
- **THEN** *Replace with a newer file* and *Previous versions* are offered and *Remove from library* is not

#### Scenario: A crafted removal by a member
- **WHEN** a member without `document.destroy` submits the removal form directly
- **THEN** it is refused and the document remains

### Requirement: Several files can be uploaded at once, each with its own outcome

The library MUST accept up to ten files in one upload, by choosing them or by
dropping them, and choosing files MUST work without JavaScript. Each file MUST
pass or fail validation and limits independently, and the result MUST name each
file with its outcome. The control MUST state the per-file limit, and the total
that applies without JavaScript.

#### Scenario: Three files, one refused
- **WHEN** a member uploads three files and the second is an executable renamed `.pdf`
- **THEN** the first and third are stored and listed
- **AND** the result names the second as refused with its reason

#### Scenario: A limit is reached part-way
- **WHEN** a member's hourly limit is reached on the third of five files
- **THEN** the first two are stored, and the rest are reported as refused with the limit named

#### Scenario: Eleven files
- **WHEN** a member submits eleven files
- **THEN** the upload is refused with a sentence naming the limit of ten, and nothing is stored

#### Scenario: No JavaScript
- **WHEN** a member with JavaScript disabled chooses two small files and submits
- **THEN** both are uploaded and each outcome is listed

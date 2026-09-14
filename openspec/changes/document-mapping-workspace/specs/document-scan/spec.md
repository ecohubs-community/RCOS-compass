## ADDED Requirements

### Requirement: A scan is started by a member, never by an upload

Uploading or extracting a document MUST NOT send any of its text to an AI
provider. A scan MUST be started by a member with `ai.run` on an extracted
document, MUST be charged to that member, and MUST state before it starts how many
paragraphs it will read. At most one scan per document MUST be live at a time, and
a live scan on one document MUST NOT prevent a scan on any other.

#### Scenario: A document is uploaded
- **WHEN** a member uploads a document and extraction completes
- **THEN** no AI call has been made for it and it is not scanned

#### Scenario: The control says what it will cost
- **WHEN** a member with `ai.run` views an unscanned document with 42 paragraphs
- **THEN** the scan control says Compass will read 42 paragraphs

#### Scenario: A member starts a scan
- **WHEN** a member with `ai.run` starts a scan on an extracted document
- **THEN** a scan is queued for that document, attributed to that member

#### Scenario: Starting twice
- **WHEN** two members start a scan on the same document at the same moment
- **THEN** exactly one scan is queued

#### Scenario: Two documents at once
- **WHEN** a scan is running on one document and a member starts a scan on another, in the same or another community
- **THEN** the second scan is queued too

#### Scenario: A member without the permission
- **WHEN** a member without `ai.run` starts a scan
- **THEN** it is refused and no scan is queued

#### Scenario: A document of another community
- **WHEN** a member starts a scan on a document belonging to another community, by id
- **THEN** the answer is the same as for a document that does not exist, and no scan is queued

### Requirement: When a document cannot be scanned, the screen says why

Where a scan cannot be started, the control MUST be shown disabled with a sentence
giving the reason: the file carries no readable text, the document is still being
read, it could not be read, the community has not adopted a standard, or AI
assistance is unavailable to this community or member. Mapping by hand MUST remain
available wherever the document has paragraphs.

#### Scenario: An image-only PDF
- **WHEN** a member views a document whose status is `reference_only`
- **THEN** the scan control is disabled with a sentence saying the file carries no readable text

#### Scenario: AI is off for the community
- **WHEN** a member views an extracted document in a community that has not switched AI on
- **THEN** the scan control is disabled with the unavailability sentence
- **AND** mapping by hand is offered

#### Scenario: The instance has no provider
- **WHEN** the application runs with `AI_PROVIDER=null`
- **THEN** no document screen reports an error about the provider, and every document with paragraphs can be mapped by hand

### Requirement: A scan reads each paragraph once, and never writes into content that changed

A scan MUST run outside the request, in batches over paragraph passages in
document order, giving each its nearest heading as context. A passage MUST be
recorded as read in the same transaction as the suggestions produced for it, and a
continued scan MUST NOT send a passage already read. A batch MUST write nothing if
the document's content was replaced, restored or re-read since the scan was
claimed, or if the scan is no longer the live one. Only suggestions MUST be
written.

#### Scenario: A scan completes
- **WHEN** every paragraph passage within the page ceiling has been read
- **THEN** the document's scan is complete

#### Scenario: Most paragraphs answer nothing
- **WHEN** a scan continues after an earlier run read twenty paragraphs and suggested for two
- **THEN** none of those twenty paragraphs are sent again

#### Scenario: The file is replaced mid-scan
- **WHEN** a member replaces a document's file while its scan is between batches
- **THEN** the scan writes no further suggestions and marks no passage of the new file as read

#### Scenario: The document is removed mid-scan
- **WHEN** a steward removes a document while its scan is running
- **THEN** the scan ends without writing anything and without an error reaching the job queue

### Requirement: A scan that cannot go on stops visibly, and can be continued

A document MUST NOT be shown as scanning indefinitely. A scan that meets a refused
budget, a failed provider, AI being switched off, the starting member losing
access, or an unexpected error MUST keep everything already produced and record
`stopped` with a sentence a member can read. A scan whose
worker stopped making progress for longer than the stall threshold MUST be shown
as stopped and MUST be claimable again. Continuing MUST be available to any member
with `ai.run` and charged to them.

#### Scenario: A member's budget runs out mid-document
- **WHEN** the budget refuses the fourth batch of a scan
- **THEN** suggestions from the first three batches are kept
- **AND** the scan is stopped with the budget sentence
- **AND** continuing sends only paragraphs not yet read

#### Scenario: The starting member leaves during a scan
- **WHEN** a scan's next batch runs after its starting member's membership ended
- **THEN** the scan stops with a reason, and no further AI call is charged to them

#### Scenario: The worker process is killed
- **WHEN** a scan's heartbeat is older than the stall threshold
- **THEN** the document shows the scan as stopped, the screen stops refreshing, and a member can continue it

#### Scenario: An unexpected error in the handler
- **WHEN** the scan handler throws something that is not a provider or budget refusal
- **THEN** the scan is stopped with a sentence a member can read and the job is not retried

#### Scenario: Progress
- **WHEN** a scan is queued or running
- **THEN** the document shows that it is scanning and how many paragraphs of how many have been read

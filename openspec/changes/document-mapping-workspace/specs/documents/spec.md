## ADDED Requirements

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

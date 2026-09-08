## ADDED Requirements

### Requirement: A community can read the terms it is working under, in the product

The instance MUST serve a privacy policy, pilot terms and a sub-processor list at
stable paths, readable without signing in, and MUST link them from the
application footer and from the public pages.

#### Scenario: A visitor reads the privacy policy
- **WHEN** the privacy policy path is requested with no session
- **THEN** it is served

#### Scenario: A member looks for the terms
- **WHEN** a member is anywhere in the application
- **THEN** the footer links the policy, the terms and the sub-processor list

#### Scenario: A document does not exist
- **WHEN** a legal document file is missing from the deployment
- **THEN** the route says so plainly rather than rendering an empty page

### Requirement: An unreviewed document says so, and the marking follows the exact text

A legal document MUST carry a visible notice that it has not been reviewed by
counsel until a platform admin marks that exact version reviewed. The review MUST
be recorded against the content of the version, so that editing the text returns
the document to unreviewed without anybody remembering to.

Marking a document reviewed MUST be restricted to a platform admin and MUST
record who did it and when.

#### Scenario: A document that nobody has reviewed
- **WHEN** it is read
- **THEN** it carries a notice saying it is a draft and has not been reviewed by counsel

#### Scenario: A document is marked reviewed
- **WHEN** a platform admin marks the current version reviewed
- **THEN** the notice is gone and the page shows when it was reviewed

#### Scenario: The text is edited afterwards
- **WHEN** the document's text changes after being marked reviewed
- **THEN** it is unreviewed again and the notice returns

#### Scenario: A steward tries to mark one reviewed
- **WHEN** somebody who is not a platform admin attempts it
- **THEN** it is refused and the review state is unchanged

### Requirement: The privacy policy states the erasure position verbatim and matches the code

The privacy policy MUST state the append-only-register-versus-erasure position:
that governance records reference a membership rather than a name, that erasure
tombstones the profile and renders historical attributions as a former-member
label, that the governance record survives, and that free text is corrected or
redacted rather than history being rewritten.

It MUST name the region the AI provider runs in, and MUST say what happens to
content a community has already exported or mirrored.

#### Scenario: A community asks what happens if somebody leaves
- **WHEN** they read the privacy policy
- **THEN** it describes the tombstone, the former-member rendering and what survives

#### Scenario: The AI region
- **WHEN** the policy is read
- **THEN** it names where inference happens, or says that no provider is configured

#### Scenario: Content already exported
- **WHEN** the policy describes redaction
- **THEN** it says plainly that a bundle already downloaded cannot be reached

### Requirement: Every table holding personal data is in the inventory

The repository MUST hold a data inventory naming each table that stores personal
data, what it holds, why, how long it is kept and what erasure does to it. A test
MUST fail when a table holding a name, an email address or an IP address is not
in it.

#### Scenario: The inventory is complete
- **WHEN** the test runs against the current schema
- **THEN** every table holding personal data appears in the inventory

#### Scenario: A new table holds an address
- **WHEN** a table with an email column is added and not listed
- **THEN** the test fails and names the table

### Requirement: Published and exported content carries its licence and attribution

Every export bundle and every public page MUST name the licence and attribution
of the standard's content, taken from the standard's own metadata rather than
written into a component, and MUST name the application's licence.

#### Scenario: A bundle is opened
- **WHEN** somebody reads an exported bundle
- **THEN** it names the standard's licence and attribution and the application's licence

#### Scenario: A public page
- **WHEN** an anonymous visitor reads a published artifact
- **THEN** the page carries the same attribution

#### Scenario: A standard published under different terms
- **WHEN** a standard whose metadata names a different licence is loaded
- **THEN** the pages and bundles carry that licence, not a hard-coded one

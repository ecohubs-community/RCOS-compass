## ADDED Requirements

### Requirement: A suggestion carries a reason, and may point at part of its passage

Evidence suggested by a model MUST carry a reason: a short plain-text sentence on
what the passage covers of the clause and what it leaves out. Evidence MAY carry
an excerpt range, which MUST lie within the passage text. A reason MUST be shown
as text in place of any strength label, and a confidence value MUST NOT reach any
screen.

#### Scenario: A suggestion is shown
- **WHEN** a member views a suggestion that has a reason
- **THEN** the reason is shown as plain text
- **AND** no confidence value or strength label is shown or present in the page data

#### Scenario: A suggestion from before reasons existed
- **WHEN** a member views a suggestion with no reason
- **THEN** it is shown without a reason line and nothing reports an error

#### Scenario: A person maps a selected part of a passage
- **WHEN** a member selects part of a paragraph's text and maps it to a clause
- **THEN** the evidence records that range as its excerpt

#### Scenario: An excerpt range outside the passage
- **WHEN** a mapping is submitted with an excerpt range beyond the passage text
- **THEN** it is refused and no evidence is written

### Requirement: Changing a suggestion's clause is one human act

A member MUST be able to answer a suggestion with a different clause. Doing so
MUST, in one transaction, make the suggestion `dismissed` and make the chosen
clause for the same passage `confirmed` by that member, reusing an existing
pairing row if there is one. The model's pairing MUST remain on record.

#### Scenario: A member corrects the clause
- **WHEN** a member changes a suggestion for §3.3.2 to §3.6.2
- **THEN** the §3.3.2 suggestion is `dismissed`
- **AND** evidence for that passage and §3.6.2 is `confirmed` by that member

#### Scenario: The chosen pairing was dismissed earlier
- **WHEN** the passage and the chosen clause already have a `dismissed` row
- **THEN** that row becomes `confirmed` by the member and no second row is created

#### Scenario: The chosen clause does not exist
- **WHEN** a member changes a suggestion to a reference that is not in the community's adopted standard
- **THEN** it is refused and the suggestion is still `suggested`

#### Scenario: A member without the permission
- **WHEN** a member without `mapping.confirm` changes a suggestion's clause
- **THEN** it is refused and nothing changes

#### Scenario: Evidence from another community
- **WHEN** a member changes the clause of evidence belonging to another community, by id
- **THEN** the answer is the same as for evidence that does not exist

### Requirement: A passage can be dismissed as not governance

A member MUST be able to dismiss every open suggestion on a passage at once. Every
`suggested` row on the passage MUST become `dismissed`, and no `confirmed` row may
change.

#### Scenario: A passage the model misread
- **WHEN** a member marks a passage with two open suggestions as not governance
- **THEN** both suggestions are `dismissed`, attributed to that member

#### Scenario: A passage that also has a confirmed claim
- **WHEN** a passage has one confirmed claim and one open suggestion and is marked not governance
- **THEN** the open suggestion is `dismissed` and the confirmed claim is unchanged

#### Scenario: A passage from another community
- **WHEN** a member marks a passage belonging to another community, by id
- **THEN** the answer is the same as for a passage that does not exist

## MODIFIED Requirements

### Requirement: Evidence goes stale rather than disappearing

Evidence MUST become `stale` and remain readable when the passage behind it is
gone — its document destroyed, its file replaced or restored, or the passage
replaced by a re-read. It MUST NOT be deleted or silently repointed, and it MUST
keep a reference to the document it was made about.

When a document's file is replaced, restored or re-read, stale evidence whose
quoted text is identical to a current passage of the same document MUST be offered
to members for re-confirmation against that passage. Re-confirming MUST be a
member's act and MUST record the new confirmer and time. Where the passage already
has evidence for the same clause, re-confirming MUST confirm that evidence rather
than create a second pairing.

Evidence records the standard version it was claimed against, so that a community
adopting a later version can be told which claims were made about the old one.
Acting on that is part of standard-version migration and is not required here;
what is required now is that the version is recorded rather than reconstructed
later, because it cannot be.

#### Scenario: A document is deleted
- **WHEN** a document and its passages are removed
- **THEN** evidence pointing at those passages becomes `stale`
- **AND** it is still visible, with what it said and who confirmed it

#### Scenario: A claim records what it was claimed against
- **WHEN** evidence is confirmed
- **THEN** it records the community's adopted standard version at that moment

#### Scenario: Stale evidence is re-confirmed
- **WHEN** a member re-confirms stale evidence against the current passage
- **THEN** its state becomes `confirmed` again with the new confirmer and time

#### Scenario: A replaced file still contains the same paragraph
- **WHEN** a document's file is replaced and a new passage has exactly the text of a stale claim's quote
- **THEN** that claim is offered for re-confirmation against the new passage
- **AND** it stays `stale` until a member re-confirms it

#### Scenario: A new scan already suggested the same pairing
- **WHEN** a stale claim for §3.6.2 is re-confirmed against a passage that a later scan already suggested for §3.6.2
- **THEN** the existing pairing becomes `confirmed` by the member
- **AND** no error occurs and no duplicate pairing exists

#### Scenario: A replaced file changed the paragraph
- **WHEN** no current passage has the stale claim's text
- **THEN** the claim is not offered for re-confirmation and stays readable as `stale`

#### Scenario: A definition keeps naming its source
- **WHEN** a definition was drafted from a document's evidence and that document is later replaced or re-read
- **THEN** the definition still names the document it came from
- **AND** the line links to the passage where one still exists, and otherwise shows the quoted words

#### Scenario: Re-confirming across communities
- **WHEN** a member re-confirms stale evidence of another community, or against another community's passage
- **THEN** the answer is the same as for evidence that does not exist

# mapping-workspace Specification

## Purpose
Covers mapping one document: the text beside the cards that say which clause each passage might answer and why, confirming, changing, dismissing and mapping by hand, moving to the next open passage and marking mapping as done, and the one-passage queue that offers all of it below 1024 pixels.
## Requirements
### Requirement: The workspace shows the document beside what has been said about it

At 1024 pixels wide and wider, a document with passages MUST be shown in one pane
and its mapping in another, each scrolling on its own. The mapping pane MUST state
how many passages were identified and how many are mapped, the community's count
of requirements that already have language, the scan control with its estimate or
its progress or the reason it is unavailable, and one card per identified passage
in document order, under a note that suggestions are AI-drafted and nothing is
applied until a member confirms.

#### Scenario: Opening a document mid-mapping
- **WHEN** a member opens a document with 23 identified passages, 14 not open
- **THEN** the mapping pane reads that 23 passages were found and 14 mapped
- **AND** the cards follow the order of the passages in the document

#### Scenario: A document not yet scanned
- **WHEN** a member with `ai.run` opens a *Not scanned* document
- **THEN** the mapping pane offers *Start RCOS mapping* with how many paragraphs it will read, and says paragraphs can also be mapped by hand

#### Scenario: A scan in progress
- **WHEN** a member has the workspace open while the document's scan runs
- **THEN** the progress updates without the member reloading, and stops updating when the scan ends

### Requirement: A card says what the passage is, which clause it might answer, and why

Each card MUST show the passage's words, its page and paragraph number, the clause
reference and name, and — for a suggestion — its reason. A card MUST offer the
clause's requirement on demand: its text in the member's locale, its normativity,
its layer and a link to it in the standard browser. A confirmed card MUST say who
confirmed it and when, and offer to turn it into a definition.

#### Scenario: A suggestion card
- **WHEN** a member views a suggestion for §3.6.2 with a reason
- **THEN** the card shows the quote, "p. 4, ¶2", "§3.6.2", the clause name and the reason
- **AND** it shows no strength or confidence

#### Scenario: Asking what the clause requires
- **WHEN** a member opens the requirement on a card
- **THEN** the adopted standard's name and version, the clause text, its normativity, its layer and owning artifact are shown, with a control to hide it again and a link to the clause in the standard browser

#### Scenario: A clause the standard does not ask a definition for
- **WHEN** a member views a confirmed claim whose clause has no owning section
- **THEN** the card shows it as mapped and does not offer to turn it into a definition

#### Scenario: A confirmed card
- **WHEN** a member views a claim Ana confirmed on 29 Aug
- **THEN** the card says it was confirmed by Ana on 29 Aug and offers "Turn into definition"

### Requirement: A suggestion can be confirmed, corrected or dismissed from its card

A card for a suggestion MUST offer *Confirm*, *Change clause* and *Dismiss* to a
member with `mapping.confirm`, and *Not governance* for its passage. *Change
clause* MUST let the member find a clause by reference, name or question. Each act
MUST work without JavaScript and MUST leave the member on the same passage. A
member without `mapping.confirm` MUST see cards without these actions.

#### Scenario: Confirming
- **WHEN** a member confirms a suggestion from its card
- **THEN** the claim is confirmed and the card shows it as mapped, still selected

#### Scenario: Correcting by searching
- **WHEN** a member chooses *Change clause* and picks §3.6.2 by typing "exit"
- **THEN** the suggestion is dismissed and §3.6.2 is confirmed for that passage

#### Scenario: Correcting without JavaScript
- **WHEN** a member with JavaScript disabled types "3.6.2" into *Change clause* and submits
- **THEN** the suggestion is dismissed and §3.6.2 is confirmed

#### Scenario: A member without the permission
- **WHEN** a member without `mapping.confirm` views a suggestion card
- **THEN** no confirm, change, dismiss or not-governance action is shown

### Requirement: A member can move to the next open passage, and finish

The workspace MUST offer a way to go to the next open passage after the selected
one in document order, wrapping to the start. When no passage is open it MUST say
so, and MUST offer *Mark mapping as done* where the document is not already
*Mapped* and no scan is live. It MUST state how many identified passages are on
the current page and on how many pages governance language was found.

#### Scenario: The next open passage is on a later page
- **WHEN** the selected passage is on page 4 and the next open passage is on page 7
- **THEN** following the link selects the passage on page 7 and shows page 7

#### Scenario: Nothing is open on a hand-mapped document
- **WHEN** no identified passage is open on an unscanned document with confirmed hand mappings
- **THEN** the pane says every identified passage has an answer and offers *Mark mapping as done*

### Requirement: Below 1024 pixels, mapping is a queue of one passage at a time

Below 1024 pixels, the workspace MUST present open passages one at a time in two
steps — reading the passage, then answering its suggested reference — with a count
of passages done out of identified, a link to see the passage in the document, the
statement that confirming does not adopt the language, and *Confirm*, *Change ref*
and *Not governance* as touch targets at least 44 pixels high. The step and the
passage MUST be in the URL.

#### Scenario: Answering on a phone
- **WHEN** a member at 375 pixels confirms passage 15 of 23
- **THEN** the queue shows the next open passage at its first step and the done count increases by one

#### Scenario: A passage with two open suggestions
- **WHEN** a passage carries two open suggestions
- **THEN** the queue presents it once per suggestion, and answering one does not discard the other

#### Scenario: Nothing the workspace offers is desktop-only
- **WHEN** a member at 375 pixels opens a document
- **THEN** starting or continuing a scan, seeing the clause's requirement, mapping a paragraph by hand, re-confirming after a replacement, turning a confirmed claim into a definition and marking mapping as done are all reachable

#### Scenario: A tablet in portrait
- **WHEN** a member opens the workspace at 768 pixels
- **THEN** the queue is shown, not two panes

#### Scenario: Seeing it in the page
- **WHEN** a member in the queue chooses to see a passage in the document
- **THEN** the document text is shown at that passage with it highlighted and a way back to the queue

#### Scenario: Keyboard alone
- **WHEN** a member uses only the keyboard in the workspace or the queue
- **THEN** every card action, the clause picker, page navigation, the next-passage link and *Mark mapping as done* can be reached and used


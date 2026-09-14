## ADDED Requirements

### Requirement: Every document can be read as text

A member MUST be able to view any document with passages as typeset text: headings
and paragraphs in order, one sheet per page with page navigation for a PDF, and one
sheet otherwise, with an outline of its headings when it has any. This view MUST
work without JavaScript. Passage text MUST be rendered through the markdown node
pipeline, never as HTML. The page shown MUST be in the URL.

#### Scenario: A Word document with headings
- **WHEN** a member opens an extracted `.docx` with three headings
- **THEN** its headings and paragraphs are shown in order, with an outline of the three headings

#### Scenario: A PDF page link
- **WHEN** a member opens a PDF's URL naming page 4
- **THEN** page 4's passages are shown with "Page 4 of 11" and previous and next page

#### Scenario: No JavaScript
- **WHEN** a member with JavaScript disabled opens a document
- **THEN** its text, page navigation and a link to download the file all work

#### Scenario: A passage containing a script tag
- **WHEN** a passage's text contains `<script>` or an HTML event attribute
- **THEN** it renders as words and nothing executes

### Requirement: Passages with claims are highlighted, and selection is shared with the rail

The text view MUST highlight each identified passage, distinguishing open
suggestions from confirmed claims by more than colour alone, and MUST highlight
only the excerpt where evidence has one. Selecting a passage MUST select it
everywhere on the screen and MUST be in the URL. A member MUST be able to select
any paragraph, identified or not, in order to map it by hand. Paragraph numbers
shown to members MUST count paragraphs only, not headings.

#### Scenario: Selecting a highlighted passage
- **WHEN** a member selects the highlighted paragraph 4.2 on page 4
- **THEN** its card is selected in the rail and the URL names that passage

#### Scenario: Selecting a card
- **WHEN** a member selects a card for a passage on page 7 while page 4 is shown
- **THEN** page 7 is shown with the passage highlighted as selected

#### Scenario: An excerpt within a paragraph
- **WHEN** a suggestion's excerpt is the first sentence of a two-sentence passage
- **THEN** only that sentence is highlighted

#### Scenario: Paragraph numbering under a heading
- **WHEN** page 4 starts with a heading followed by two paragraphs
- **THEN** the second paragraph is referred to as "p. 4, ¶2"

#### Scenario: Mapping an unidentified paragraph
- **WHEN** a member selects a paragraph with no evidence
- **THEN** the rail offers to map it to a clause by hand

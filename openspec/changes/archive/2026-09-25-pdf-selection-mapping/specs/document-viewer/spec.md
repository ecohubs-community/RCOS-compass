## ADDED Requirements

### Requirement: Words selected in the original PDF view can be mapped by hand

In the original PDF view, a member who may map MUST be offered the hand-map card
for words they select inside one paragraph that has no claim, with those words as
the excerpt, just as in the text view. Clicking a paragraph without selecting
words MUST select that paragraph, whether or not it is identified, so it can be
mapped whole. While the card is open, the PDF MUST show the excerpt's lines, or
the whole paragraph's lines when there is no excerpt, as selected, by more than
colour alone. Selecting a paragraph in the PDF MUST NOT scroll the view away from
it. Words in a heading, and text that belongs to no passage, MUST NOT offer the
card.

#### Scenario: Selecting a sentence in an unidentified paragraph
- **WHEN** a member drags across the second sentence of paragraph 3 on page 2 of the original view, and that paragraph has no claim
- **THEN** the URL names that paragraph, the hand-map card offers to map it with that sentence as the excerpt, and the sentence's lines are marked as selected in the PDF

#### Scenario: Mapping the selection
- **WHEN** the member picks a clause in that card and submits it
- **THEN** a confirmed claim with that excerpt range is recorded, and after the reload the PDF highlights only the sentence's lines as confirmed

#### Scenario: Clicking an unidentified paragraph
- **WHEN** a member clicks inside paragraph 5 on page 4 without dragging, and it has no highlight
- **THEN** that paragraph is selected, the card offers to map it whole, and the view stays where it is

#### Scenario: Selecting on a page other than the one in the URL
- **WHEN** the URL names page 1 and the member selects words in a paragraph on page 6 after scrolling there
- **THEN** the card offers that paragraph on page 6 with those words, and the view does not jump back to page 1

#### Scenario: Selecting by touch
- **WHEN** a member on a touch screen at 1024 pixels or wider selects a sentence of an unidentified paragraph and adjusts the selection handles
- **THEN** the card offers that paragraph with the finally selected words once the selection has settled

#### Scenario: The selected words stay out of the URL
- **WHEN** a member selects words in the original view
- **THEN** the URL names the passage and never the words

#### Scenario: Selecting words in a heading
- **WHEN** a member selects words in a heading in the original view
- **THEN** no hand-map card is offered

#### Scenario: Selecting text outside every passage
- **WHEN** a member selects a running page number that extraction did not keep as a passage
- **THEN** nothing is selected and no card is offered

### Requirement: A selection maps to the words the member selected

The excerpt offered for a selection MUST, in both the text view and the original
view, be the occurrence of the selected words where the selection began, not the
first occurrence in the paragraph. It MUST be found despite differences in
whitespace and line breaks, and despite a word hyphenated across a line that
extraction joined back together. The card MUST show the passage's own stored words
for that range. A selection that spans two paragraphs MUST NOT become an excerpt
of either, and the member MUST be told to select within one paragraph or to click
a paragraph to map it whole.

#### Scenario: A phrase that appears twice
- **WHEN** a paragraph says "the council decides" in its first and third sentences, and the member selects the one in the third sentence
- **THEN** the excerpt range covers the third sentence's occurrence

#### Scenario: A word hyphenated across a line
- **WHEN** the PDF shows "regen-" at the end of one line and "erative" at the start of the next, and the member selects across both
- **THEN** the excerpt is found, and the card shows "regenerative" as the passage stores it

#### Scenario: A selection across two paragraphs
- **WHEN** a member selects from the end of one paragraph into the start of the next, in either view
- **THEN** no card offers an excerpt, and a message says to select within one paragraph or click a paragraph to map it whole

#### Scenario: Words the passage does not contain
- **WHEN** the selected words cannot be found in the passage text they started in
- **THEN** the paragraph is offered to be mapped whole, and no excerpt range is submitted

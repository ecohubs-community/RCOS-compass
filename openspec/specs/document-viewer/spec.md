# document-viewer Specification

## Purpose
Covers reading a document on screen: its text as headings and paragraphs a page at a time, and a PDF as it was uploaded, with passages highlighted line by line, selection shared with the mapping cards through the URL, and the rules that keep a hostile file from running or linking anything in the browser.
## Requirements
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

### Requirement: A PDF can be seen as it was uploaded

At 1024 pixels wide and wider, a member MUST be able to view an extracted PDF
rendered as its original pages, as the default view for a PDF with a switch to the
text view, both kept in the URL. The view MUST offer page thumbnails marking the
pages that hold an identified passage, the current page and page count with
previous and next, and zoom. Where the original cannot be shown — no JavaScript, or
rendering fails — the text view MUST be shown with a sentence saying so and a link
to download the file.

#### Scenario: Opening a PDF
- **WHEN** a member opens an extracted PDF at 1440 pixels
- **THEN** its pages are shown as rendered from the file, starting at the page in the URL or the first page

#### Scenario: Thumbnails mark where governance is
- **WHEN** pages 2, 3, 4 and 7 hold identified passages
- **THEN** those thumbnails, and only those, carry a marker

#### Scenario: Switching to text
- **WHEN** a member switches the PDF to the text view
- **THEN** the text view is shown at the same page and the URL records the view

#### Scenario: A PDF that cannot be rendered
- **WHEN** rendering the file in the browser fails
- **THEN** the text view is shown with a sentence saying the original couldn't be shown and a download link, not an empty pane

#### Scenario: A Word document
- **WHEN** a member opens an extracted `.docx`
- **THEN** no original-view control is offered

#### Scenario: On a phone
- **WHEN** a member at 375 pixels chooses to view the original page from the queue
- **THEN** that page is rendered at the screen's width

### Requirement: Highlights in the original view match the text, line by line

The original view MUST highlight each identified passage over the lines it
occupies on the page, or only the lines its excerpt spans, with the same
distinction between open, confirmed and selected as the text view, by more than
colour alone. Each highlight MUST be reachable by keyboard and labelled. Selecting
a highlight MUST select its card, and selecting a card MUST bring its highlight
into view as selected, through the passage in the URL.

#### Scenario: Selecting a highlight
- **WHEN** a member activates the highlight of paragraph 4.2 on page 4
- **THEN** its card is selected in the rail and the URL names that passage

#### Scenario: Selecting a card on another page
- **WHEN** a member selects a card for a passage on page 7 while page 4 is shown
- **THEN** page 7 scrolls into view with the passage's highlight selected

#### Scenario: An excerpt over one line of three
- **WHEN** a suggestion's excerpt lies within the second line of a three-line passage
- **THEN** only that line is highlighted

#### Scenario: A rotated page
- **WHEN** a passage sits on a page rotated by 90 degrees
- **THEN** its highlight covers its lines as they appear on the rendered page

#### Scenario: Keyboard alone
- **WHEN** a member tabs through the original view
- **THEN** each highlight receives focus with a label naming its passage and state, and activating it selects the card

### Requirement: Rendering an uploaded file in the browser cannot run what the file carries

The original view MUST render with script evaluation disabled, with no PDF
scripting, no forms, and no link from the document drawn or clickable, and with
limits on decoded image size and canvas area. Its code, worker, fonts and character
maps MUST be served from the application's own origin. The file MUST be fetched
from the member-only file route, which MUST continue to serve it as an attachment.
The Content-Security-Policy MUST permit workers from the application's origin and
MUST NOT gain `unsafe-inline`, `unsafe-eval`, `wasm-unsafe-eval` or any external
host in `script-src`.

#### Scenario: A PDF with embedded JavaScript and a link annotation
- **WHEN** a member opens a PDF carrying a document-level script and a link annotation to an external site
- **THEN** no script from the file runs, no link from it is present or clickable, no navigation happens, and no CSP violation is reported

#### Scenario: A PDF with an enormous image
- **WHEN** a member opens a PDF whose page carries an image beyond the decoded-size limit
- **THEN** the page renders without that image or at reduced resolution, and the tab stays responsive

#### Scenario: The policy
- **WHEN** the response headers of the document screen are read
- **THEN** `worker-src` allows `'self'`, and `script-src` contains no `unsafe-` source and no other host

#### Scenario: Somebody outside the community requests the file
- **WHEN** the file route is requested with no session, or by a member of another community
- **THEN** the answer is the same as for a document that does not exist


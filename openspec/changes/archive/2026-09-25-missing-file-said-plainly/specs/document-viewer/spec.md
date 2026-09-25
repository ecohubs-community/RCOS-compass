## ADDED Requirements

### Requirement: A document whose file is missing says so

When a document's stored file is not in storage, the document screen MUST say
that the file is missing, at every width. It MUST NOT offer a download of the file
or try to render the original view. It MUST still show the text Compass read
from the file. The sentence MUST NOT blame the file's format. The screen MUST NOT
reveal a storage path.

#### Scenario: A PDF whose file has gone
- **WHEN** a member opens an extracted PDF whose stored file is missing
- **THEN** a sentence says the file is missing from storage, its text is shown, and neither a download link nor the original view is offered

#### Scenario: A Word document whose file has gone
- **WHEN** a member opens an extracted `.docx` whose stored file is missing
- **THEN** the same sentence is shown with the document's text and no download link

#### Scenario: A file that is there but will not render
- **WHEN** the stored file exists but rendering it in the browser fails
- **THEN** the sentence saying the original couldn't be shown is used, with a download link, as before

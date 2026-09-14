## ADDED Requirements

### Requirement: A mapping suggestion explains itself, and its explanation is inert

The mapping task MUST return, for every pairing, a reason of at most 200
characters, and MAY return an excerpt of the passage the pairing relies on. A
pairing with no usable reason MUST be discarded and logged. The reason MUST be
stored and shown as plain text — never rendered as markup and never turned into a
link. An excerpt MUST be kept only when it occurs verbatim in the passage, ignoring
differences of whitespace; otherwise the excerpt MUST be dropped and the pairing
kept. Headings MUST NOT be offered to the model as passages; the nearest heading
above a passage MAY be given as context.

#### Scenario: A pairing with a reason and an excerpt
- **WHEN** a pairing arrives with a reason and an excerpt that occurs in the passage
- **THEN** a suggestion is stored with that reason and the excerpt's range in the passage

#### Scenario: The model invents an excerpt
- **WHEN** a pairing's excerpt does not occur in the passage
- **THEN** the suggestion is stored without an excerpt

#### Scenario: The model omits the reason
- **WHEN** a pairing arrives with no reason, or a reason over the limit
- **THEN** that pairing is discarded and logged

#### Scenario: A document tries to smuggle markup through the reason
- **WHEN** an uploaded document instructs the model to answer with a reason containing a link, HTML or markdown
- **THEN** whatever is stored is shown as literal text
- **AND** no element other than text is rendered from it

#### Scenario: A heading is never a candidate
- **WHEN** a scan sends passages to the model
- **THEN** no passage of kind `heading` is among the numbered passages

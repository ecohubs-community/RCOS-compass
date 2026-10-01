# question-guidance Specification

## Purpose
Covers the guidance beside a Path question: sub-questions a proposal should answer — which never become Path items of their own, so a section stays one decision — and example answers, each labelled as an example and by where it came from.
## Requirements
### Requirement: A Path item may carry sub-questions, answered in one discussion

Sub-questions that accompany a section's Path question MUST NOT create further
Path items, discussions or definitions: the section remains one item, one
discussion and one definition, and a proposal answers its sub-questions together.
A sub-question MUST NOT ask about something another section of the standard owns.

#### Scenario: Registered authorities
- **WHEN** a member opens the discussion for "Registered Authorities"
- **THEN** it lists sub-questions for scope, limits, term, the source of authority, and temporary or emergency authority
- **AND** the Path still shows one item for that section

#### Scenario: Contribution recognition does not repeat its siblings
- **WHEN** a member reads the sub-questions for "Contribution Recognition Mechanism"
- **THEN** none asks which kinds of work count, or how internal units work, because "Recognized Contribution Categories" and "Internal Units" own those

### Requirement: Example answers are labelled as examples and say where they came from

A Path item MAY show example answers. Every example MUST be presented as an
example and not a recommendation, and MUST say whether it was written for Compass
or taken from the standard's template. Template examples MUST be the template's
own "e.g." placeholders that end as a sentence, in the community's locale;
fragments of a table row MUST NOT be shown as examples.

#### Scenario: Voluntary exit
- **WHEN** a member opens the examples for "Voluntary Exit"
- **THEN** a full example answer written for Compass is shown, labelled as such
- **AND** the template's "Time-to-revocation of access (e.g. within 24 hours of confirmation)." is shown, labelled as from the RCOS template

#### Scenario: A table fragment
- **WHEN** a section's template placeholder is "e.g. Finance Steward"
- **THEN** it is not shown as an example

### Requirement: What to cover is shown where the answer is written

A discussion and a definition that answer a section MUST show that section's
sub-questions and examples, when it has any. In a discussion the guidance MUST
start collapsed and open with one activation, by keyboard and by touch. It MUST
work without JavaScript.

#### Scenario: In a discussion
- **WHEN** a member opens the "Voluntary Exit" discussion and opens "What to cover"
- **THEN** the sub-questions and the examples are shown

#### Scenario: A section with no guidance
- **WHEN** a member opens a discussion for a section with no sub-questions and no examples
- **THEN** no "What to cover" control is shown

#### Scenario: Without JavaScript
- **WHEN** a member with scripts disabled opens "What to cover"
- **THEN** it opens


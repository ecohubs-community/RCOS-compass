## ADDED Requirements

### Requirement: Guidance is shown in the community's language

A Path item's question, sub-questions and example answers MUST come from the
guidance the vendored standard publishes with the section, in the community's
locale. Where that locale lacks a field, that field MUST fall back to the
standard's default locale rather than render empty; the other fields MUST stay
in the community's locale. The document-mapping model prompt MUST keep using the
default-locale question.

#### Scenario: A German community
- **WHEN** a member of a German community opens "What to cover" for "Voluntary Exit"
- **THEN** the sub-questions and the example answer are the German ones RCOS publishes
- **AND** the Path shows that section's German question

#### Scenario: An English community sees what it saw before
- **WHEN** a member of an English community opens the Path
- **THEN** every question, sub-question and example is the text Compass's annotations carried before this change

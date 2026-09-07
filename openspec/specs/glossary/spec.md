# glossary Specification

## Purpose
Covers the term list a community reads: how every term the standard defines is shown beside the community's own adopted definition where one exists, how the mapping from term to section comes from the vendored standard rather than being guessed, and why the glossary is computed from adopted definitions at read time rather than maintained as text of its own.
## Requirements
### Requirement: The glossary shows the standard's term beside the community's own

Every term the standard defines MUST be listed with its own definition, and with
the community's adopted definition where one exists.

#### Scenario: A community has defined a term
- **WHEN** a community has an adopted definition for a term's section
- **THEN** the glossary shows both, and says which is which

#### Scenario: A community has not defined it
- **WHEN** no adopted definition covers a term
- **THEN** the standard's definition is shown alone
- **AND** it says plainly that this community has not defined it

#### Scenario: A term whose mapping is unknown
- **WHEN** no link exists between a term and a section
- **THEN** the standard's definition is shown alone
- **AND** nothing is guessed on the community's behalf

#### Scenario: The standard carries the mapping
- **WHEN** the vendored standard is loaded
- **THEN** its glossary terms name the sections that define them
- **AND** a term naming a section the standard does not have fails the content check

### Requirement: The glossary is derived, never maintained

Glossary entries MUST be computed from adopted definitions at read time. No
glossary text about a community MUST be stored separately from the definition it
comes from.

#### Scenario: A definition is adopted
- **WHEN** a community freezes a definition
- **THEN** the glossary shows it without anybody updating a glossary

#### Scenario: A definition is superseded
- **WHEN** a later version is adopted
- **THEN** the glossary shows the current text

#### Scenario: The community reads a term in the standard's own language
- **WHEN** a community's locale is not English
- **THEN** the standard's term and definition appear in that locale where the standard has one

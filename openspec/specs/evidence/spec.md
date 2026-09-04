# evidence Specification

## Purpose
Covers the claim that a community already has language about a clause: how a person maps a passage to a clause by hand, the states evidence moves through and the human act of confirming it, why confirmed evidence moves no number, how it becomes a definition draft in the community's own words, and why it goes stale rather than disappearing.
## Requirements
### Requirement: A passage is mapped to a clause by a person

The application MUST allow a member to map a passage to a clause by hand, without
any AI provider configured. Manual mapping MUST be a complete path from an
uploaded document to a pre-filled definition draft.

#### Scenario: A member maps a passage themselves
- **WHEN** a member selects a passage and names the clause it answers
- **THEN** evidence is recorded as `confirmed`, attributed to that member
- **AND** no AI provider was involved

#### Scenario: The instance has no AI provider
- **WHEN** the application runs with the `null` provider
- **THEN** upload, extraction, mapping and "turn into a definition" all work
- **AND** nothing in the flow reports an error about a missing provider

#### Scenario: A passage from another community
- **WHEN** a member maps a passage belonging to another community, by id
- **THEN** the answer is the same as for a passage that does not exist

### Requirement: Evidence has a state, and confirming it is a human act

Evidence MUST carry a state of `suggested`, `confirmed`, `dismissed` or `stale`,
and MUST record who confirmed or dismissed it and when. Evidence MUST NOT be
created in `confirmed` state by anything other than a person.

#### Scenario: A suggestion is confirmed
- **WHEN** a member confirms a suggested mapping
- **THEN** its state becomes `confirmed` with that member and the time recorded

#### Scenario: A suggestion is dismissed
- **WHEN** a member dismisses a suggested mapping
- **THEN** its state becomes `dismissed` and it is not offered again
- **AND** the record of the suggestion remains

#### Scenario: A suggestion arrives from a model
- **WHEN** an AI mapping task produces a mapping
- **THEN** the evidence row is created in `suggested` state
- **AND** no mapping reaches `confirmed` without a person confirming it

### Requirement: Evidence is a weaker claim than a definition and moves no number

Confirmed evidence MUST NOT change readiness, artifact completeness, or the
outward compliance claim. It states that a community has language about a clause,
not that the community has defined it.

#### Scenario: A community confirms mappings for clauses it has not defined
- **WHEN** a member confirms evidence for twenty clauses with no adopted definitions
- **THEN** readiness is unchanged
- **AND** the compliance claim is unchanged

#### Scenario: A community sees what it already has
- **WHEN** confirmed evidence exists
- **THEN** the count of clauses with existing language is shown separately from readiness
- **AND** it is not presented as progress toward compliance

### Requirement: Evidence can become a definition draft in the community's own words

Confirmed evidence MUST offer to pre-fill a definition draft with the passage's
text. The result MUST be a draft, and MUST enter the ordinary discuss-propose-
freeze path rather than becoming an adopted definition.

#### Scenario: A member turns evidence into a definition
- **WHEN** a member chooses "turn this into a definition" on confirmed evidence
- **THEN** a draft is created for the clause's section, pre-filled with the passage text
- **AND** the definition is not adopted and moves no number until it is frozen

#### Scenario: The section already has an adopted definition
- **WHEN** the clause's section already has an adopted definition
- **THEN** the passage's text is offered as a proposal to change it
- **AND** the adopted definition is unchanged until a freeze

### Requirement: Evidence goes stale rather than disappearing

Evidence MUST become `stale` and remain readable when the passage behind it is
gone — its document destroyed, or the passage itself replaced. It MUST NOT be
deleted or silently repointed.

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

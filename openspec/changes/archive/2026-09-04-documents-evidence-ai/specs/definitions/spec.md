## ADDED Requirements

### Requirement: The linter's assisted rules stay silent rather than guess

The two rules the linter cannot decide from text alone MUST be answered by a
provider or not at all. Without one — no provider configured, the provider
failing, or a budget exhausted — the panel MUST say the check was not run. It
MUST NOT report the definition as having passed a check nobody performed.

#### Scenario: A provider is available
- **WHEN** a definition is linted with a provider configured and in budget
- **THEN** the assisted findings appear alongside the rule-based ones

#### Scenario: No provider is configured
- **WHEN** a definition is linted with the `null` provider
- **THEN** every rule-based finding still appears
- **AND** the assisted checks are reported as not run, not as passed

#### Scenario: The member is out of budget
- **WHEN** a member who has spent their AI budget lints a definition
- **THEN** the result is the same as having no provider
- **AND** the rule-based findings are unaffected

#### Scenario: The linter is still advice
- **WHEN** an assisted finding says an auditor could not check the definition
- **THEN** the community may still freeze it
- **AND** the finding is stored with the version

## MODIFIED Requirements

### Requirement: A version records how it was written

A definition version MUST record whether it was drafted with AI assistance and
the linter result at the time it was frozen. Where a definition's text began —
a passage from a document the community uploaded, or nothing — MUST also be
recorded, because it is part of what a reader a year later needs and cannot be
reconstructed afterwards.

#### Scenario: A version is frozen
- **WHEN** a definition version is adopted
- **THEN** it stores its linter result and whether AI assisted it

#### Scenario: The linter disagrees with the community
- **WHEN** a definition with unresolved linter warnings is frozen
- **THEN** the freeze succeeds and the warnings are stored with the version

#### Scenario: A definition began as the community's own document
- **WHEN** a draft pre-filled from confirmed evidence is frozen
- **THEN** the definition still records the evidence its text came from
- **AND** the reader can reach the passage and the document behind it

#### Scenario: A definition was typed from nothing
- **WHEN** a draft written by hand is frozen
- **THEN** no origin is recorded, rather than an empty one

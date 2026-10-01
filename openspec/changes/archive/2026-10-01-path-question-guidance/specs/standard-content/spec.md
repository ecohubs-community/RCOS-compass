## ADDED Requirements

### Requirement: Annotation guidance is validated

The content check MUST fail when an annotation's `prompts` or `examples` is not a
list, or contains an entry that is not a non-empty string.

#### Scenario: An empty prompt
- **WHEN** an annotation lists an empty string under `prompts`
- **THEN** `pnpm check:standard` fails, naming the section

#### Scenario: The vendored annotations
- **WHEN** `pnpm check:standard` runs against RCOS-Core 0.1
- **THEN** it passes

## RENAMED Requirements

- FROM: `### Requirement: Annotation guidance is validated`
- TO: `### Requirement: Published guidance is validated`

## MODIFIED Requirements

### Requirement: Every authored section carries a plain-language question

The content check MUST fail when an authored section of a vendored standard has
no non-empty `question` in the standard's default locale, read from the
section's own published data (`sections.yaml`, `i18n.<locale>.question`). A
question on a section that is not authored MUST still be accepted, since the
Path never shows it. The loader MUST serve the question in the requested locale,
falling back to the default locale for that field alone when the locale lacks
it.

#### Scenario: An authored section loses its question
- **WHEN** the English `question` of `exit-protocol.voluntary-exit` is removed from `sections.yaml`
- **THEN** `pnpm check:standard` fails, naming that section and the default locale

#### Scenario: Every authored section has a question
- **WHEN** `pnpm check:standard` runs against the vendored RCOS-Core 0.1
- **THEN** it passes

#### Scenario: A translation without its question
- **WHEN** a section's German entry has a title and prompts but no question
- **THEN** the loader returns the English question for a German request
- **AND** the German prompts

### Requirement: Published guidance is validated

The content check MUST fail when a section's `prompts` or `examples`, in any
locale, is not a list or contains an entry that is not a non-empty string,
naming the section and the locale.

#### Scenario: An empty prompt
- **WHEN** a section's German `prompts` contains an empty string
- **THEN** `pnpm check:standard` fails, naming the section and `de`

#### Scenario: The vendored guidance
- **WHEN** `pnpm check:standard` runs against RCOS-Core 0.1
- **THEN** it passes

## ADDED Requirements

### Requirement: Annotations carry effort and ordering only

Compass's `annotations.yaml` MUST hold only `effort` and `dependsOn` per
section, and the content check MUST fail on any other field, naming the section
and the field — the question, prompts and examples are part of the published
standard, and a copy here would never be shown. An annotation MUST name an
existing section, and every `dependsOn` entry MUST name an existing section
other than its own. A section without an annotation MUST still load and be
answerable.

#### Scenario: A question written back into the annotations
- **WHEN** `annotations.yaml` gives `exit-protocol.voluntary-exit` a `question`
- **THEN** `pnpm check:standard` fails, naming that section and `question`
- **AND** the vendored files still match their published hashes

#### Scenario: A dependency into nothing
- **WHEN** an annotation depends on `nothing.like-this`
- **THEN** `pnpm check:standard` fails, naming the annotation and the missing section

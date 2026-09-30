## ADDED Requirements

### Requirement: Every authored section carries a plain-language question

The content check MUST fail when an authored section of a vendored standard has
no annotation, or an annotation with an empty question. An annotation for a
section that is not authored MUST still be accepted, since the Path never shows
it.

#### Scenario: An authored section loses its annotation
- **WHEN** `exit-protocol.voluntary-exit` is removed from `annotations.yaml`
- **THEN** `pnpm check:standard` fails, naming that section

#### Scenario: Every authored section is annotated
- **WHEN** `pnpm check:standard` runs against the vendored RCOS-Core 0.1
- **THEN** it passes

## ADDED Requirements

### Requirement: The bundle carries the community's feedback on the standard

An export MUST include the community's feedback on the standard as Markdown and
JSON, filtered by the same rules as the in-app list, and MUST name that file in
its readme. Including it MUST NOT send anything to any external service.

#### Scenario: A community with feedback exports
- **WHEN** a steward exports a community that has recorded feedback on the standard
- **THEN** the bundle contains `standard-feedback.md` and `standard-feedback.json` with each entry's words, standard, version, author label and date

#### Scenario: A community without feedback exports
- **WHEN** a community with no recorded feedback exports
- **THEN** both files are present and say there is none

#### Scenario: Feedback on a restricted definition
- **WHEN** the exporter may not see the definition an entry came from
- **THEN** that entry is not in the bundle

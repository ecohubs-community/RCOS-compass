# pilot-feedback Specification

## Purpose
Covers turning what a pilot notices into work: a report a member files from the screen they are on carrying the route and their own words and nothing else from the page, visible to the community that made it and to nobody else, and exported as Markdown grouped by screen so a proposal starts from it.
## Requirements
### Requirement: A member can report a problem from the screen they are on

A member MUST be able to report something from any screen. The report MUST carry
the route, the community, the reporting membership, a kind and the member's own
words.

It MUST NOT capture page content, form values, a screenshot or anything the
member did not type into it.

#### Scenario: A member reports something
- **WHEN** they submit a report from a screen
- **THEN** it is stored with the route, the kind and their words

#### Scenario: What is not captured
- **WHEN** a report is submitted from a screen with a half-written definition on it
- **THEN** the stored report contains none of that text

#### Scenario: An anonymous visitor
- **WHEN** somebody with no session attempts to submit a report
- **THEN** it is refused

### Requirement: Reports are visible to the community that made them

A steward MUST be able to read their own community's reports. A report MUST NOT
be visible to another community.

#### Scenario: A steward reads their reports
- **WHEN** a steward opens the feedback list
- **THEN** they see their community's reports

#### Scenario: Another community's reports
- **WHEN** a steward of one community requests a report belonging to another
- **THEN** the answer is the same as for a report that does not exist

### Requirement: Reports leave as something a proposal can start from

A platform admin MUST be able to export the open reports as Markdown grouped by
route and kind, so that pilot feedback becomes proposal material rather than a
chat backlog.

#### Scenario: The export
- **WHEN** a platform admin exports the open reports
- **THEN** they receive Markdown grouped by route and kind, each entry carrying the community and the words

#### Scenario: A handled report
- **WHEN** a report has been marked handled
- **THEN** it is not in the export

#### Scenario: An erased reporter
- **WHEN** the member who filed a report has been erased
- **THEN** the report renders as from a former member and keeps its text

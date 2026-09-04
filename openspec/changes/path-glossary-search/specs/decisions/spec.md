## MODIFIED Requirements

### Requirement: A decision is findable a year later

Every decision MUST have a permalink, MUST appear in the register with its type,
layer, date, review date, mechanism and tally, and MUST be findable by searching
for the question it answers.

Searching MUST go through the application's search index rather than scanning the
decision table, and MUST return only decisions recorded by the searching member's
own community — the boundary being part of the query rather than a filter applied
to its results.

#### Scenario: A decision is looked up by reference
- **WHEN** its reference is opened
- **THEN** the decision, the proposal text as adopted, its rationale and its related clauses are shown

#### Scenario: A member asks a question in their own words
- **WHEN** a member searches for wording that appears in an adopted definition
- **THEN** the decision and the clause it answers are both offered

#### Scenario: A member of another community opens the permalink
- **WHEN** they request it
- **THEN** the answer is the same as for a decision that does not exist

#### Scenario: A member of another community searches for its words
- **WHEN** a member searches for wording that appears only in another community's decision
- **THEN** nothing is returned

#### Scenario: A decision recorded a moment ago
- **WHEN** a freeze has just completed
- **THEN** searching for its words finds it, without waiting for a job

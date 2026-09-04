## ADDED Requirements

### Requirement: Nothing outside the search module knows how search works

Full-text search MUST sit behind a `SearchIndex` interface, and the engine's
query language MUST NOT appear anywhere else in the application.

#### Scenario: A caller searches
- **WHEN** any service searches
- **THEN** it calls the interface and receives hits, without naming an engine

#### Scenario: Raw engine SQL appears elsewhere
- **WHEN** a file outside the search module writes full-text query syntax
- **THEN** the build fails

### Requirement: A search never crosses a community boundary

Every indexed row MUST carry its community, and the filter MUST be part of the
query rather than applied to its results.

#### Scenario: Two communities use the same words
- **WHEN** two communities each have a decision about water
- **THEN** a member of one searching for water sees only their own

#### Scenario: A community with nothing indexed
- **WHEN** a member of a community with no decisions searches
- **THEN** they get no results, rather than another community's

### Requirement: What is findable matches what exists

Indexing MUST happen in the same transaction as the act that causes it, so a
decision, definition or discussion is findable as soon as it exists. Rebuilding
the index from the rows MUST produce the same result as building it incrementally.

#### Scenario: A decision is recorded
- **WHEN** a freeze completes
- **THEN** the decision is findable immediately

#### Scenario: A definition is superseded
- **WHEN** a new version is adopted
- **THEN** searching finds the current text, not the replaced text

#### Scenario: A document is deleted
- **WHEN** a document and its passages are removed
- **THEN** they are no longer findable

#### Scenario: The index is rebuilt
- **WHEN** the index is rebuilt from the rows
- **THEN** the same searches return the same hits as before the rebuild

### Requirement: The reverse lookup cites and does not answer

A plain-language question MUST return the clauses and decisions that govern it,
each with its reference. It MUST NOT return prose of its own, a summary, or an
answer to the governance question asked.

#### Scenario: A member asks about spending
- **WHEN** a member searches "can we spend €800 on the water pump?"
- **THEN** they get the clauses and decisions that govern spending, with references
- **AND** no sentence purporting to answer whether they can

#### Scenario: Nothing matches
- **WHEN** a question matches nothing
- **THEN** the member is told which words were searched for
- **AND** it does not appear that the feature failed

#### Scenario: No AI is configured
- **WHEN** the instance runs with no AI provider
- **THEN** the reverse lookup works exactly as it does with one

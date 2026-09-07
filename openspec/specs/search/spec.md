# search Specification

## Purpose
Covers full-text search: the `SearchIndex` interface that keeps the engine's query language out of the rest of the application, the community boundary carried on every indexed row and applied inside the query rather than to its results, why clause text is matched against the loaded standard instead of being copied per community, the transactional indexing that makes what exists findable at once, and the reverse lookup that cites the clauses and decisions governing a question without answering it.
## Requirements
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

What is indexed is what a community wrote: adopted definitions, decisions,
discussion titles, and document passages. Clause text MUST NOT be indexed per
community — it is identical for every one of them, and putting non-tenant data
inside a structure whose whole discipline is tenant isolation invites the leak it
exists to prevent. Clauses are matched against the loaded standard instead.

#### Scenario: Two communities use the same words
- **WHEN** two communities each have a decision about water
- **THEN** a member of one searching for water sees only their own

#### Scenario: A community that has written nothing
- **WHEN** a member of a community with no decisions or definitions searches
- **THEN** nothing of any community's is returned

#### Scenario: The standard is searched by every community
- **WHEN** two communities search for a word that appears only in the standard
- **THEN** both find the same clause
- **AND** the index holds no copy of the standard for either of them

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

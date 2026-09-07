## MODIFIED Requirements

### Requirement: A search never crosses a community boundary

Every indexed row MUST carry its community, and the filter MUST be part of the
query rather than applied to its results.

What is indexed is what a community wrote: adopted definitions, decisions,
discussion titles, and document passages. Clause text MUST NOT be indexed per
community — it is identical for every one of them, and putting non-tenant data
inside a structure whose whole discipline is tenant isolation invites the leak it
exists to prevent. Clauses are matched against the loaded standard instead.

Every indexed row MUST also carry its visibility, and every query MUST filter on
it in the same way. A search MUST NOT be a route by which a reader reaches text
they could not read directly.

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

#### Scenario: A restricted definition is searched for
- **WHEN** a member who may not see a restricted definition searches for words that appear only in it
- **THEN** nothing is returned

#### Scenario: Visibility changes
- **WHEN** a definition's visibility changes
- **THEN** the index reflects it in the same transaction, as it does for the text

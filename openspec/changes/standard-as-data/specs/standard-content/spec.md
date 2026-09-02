## ADDED Requirements

### Requirement: A clause is identified by standard, version and reference

A clause reference MUST be the triple `(standard_id, version, ref)`. A bare
number MUST NOT be treated as an identifier, because modules number their clauses
from 1.1.1 as well and the same ref may point at different text in a later
version.

#### Scenario: Two standards use the same reference
- **WHEN** core 0.1 and a module both define a clause with ref `1.1.1`
- **THEN** they are distinct clauses, addressable separately
- **AND** neither collides with the other in storage or lookup

#### Scenario: A clause is looked up by its stable key
- **WHEN** a clause is resolved by `(standard_id, version, key)`
- **THEN** the same clause is returned regardless of its display ref
- **AND** the key does not change when the standard renumbers

#### Scenario: The published reference is preserved
- **WHEN** a clause is loaded from the core specification
- **THEN** its `ref` is the document section number exactly as published
- **AND** its `layer` is derived from the chapter, not from the ref

### Requirement: Every MUST clause has exactly one owner or an explicit disposition

Every clause MUST carry a disposition. A clause with disposition
`defined_by_section` MUST be owned by exactly one template section; a clause that
no community answers MUST be marked `satisfied_by_platform` or
`not_a_definition` and MUST NOT be owned. The build MUST fail when this does not
hold.

#### Scenario: A clause is claimed by two sections
- **WHEN** two sections both declare ownership of the same clause
- **THEN** validation fails, naming the clause and both sections

#### Scenario: A defined_by_section clause has no owner
- **WHEN** a clause is `defined_by_section` and no section owns it
- **THEN** validation fails, naming the clause

#### Scenario: A clause no community answers
- **WHEN** a clause requires that artifacts be versioned and accessible to members
- **THEN** it is `satisfied_by_platform`, owned by no section, and carries an
  explanation of how the application satisfies it

#### Scenario: A section references a clause it does not own
- **WHEN** a section cross-references a clause owned elsewhere
- **THEN** that is permitted, and the reference contributes nothing to ownership

### Requirement: Only community-answerable MUST clauses are countable

Readiness denominators MUST count only clauses whose normativity is `MUST` and
whose disposition is `defined_by_section`. Counting the others would make 100%
unreachable by construction.

#### Scenario: The countable set is computed
- **WHEN** the loaded standard is asked for its countable clauses
- **THEN** every returned clause is `MUST` and `defined_by_section`
- **AND** no `satisfied_by_platform` or `not_a_definition` clause is included
- **AND** no `SHOULD` or `MAY` clause is included

#### Scenario: A count is requested rather than hard-coded
- **WHEN** any total is displayed
- **THEN** it is derived from the loaded standard at runtime

### Requirement: The loader supports many standards and versions

The loader MUST address content by `(standard_id, version)` and MUST NOT assume a
single standard or a single version, so that modules and a future core version
need content and screens rather than a schema migration.

#### Scenario: A second standard is present
- **WHEN** content for another standard id exists alongside core
- **THEN** both load, and each is queried independently

#### Scenario: An unknown standard or version is requested
- **WHEN** content is requested for a standard or version that is not present
- **THEN** the loader reports it clearly rather than returning an empty standard

#### Scenario: Content is read repeatedly
- **WHEN** the same standard is requested many times
- **THEN** it is parsed once and served from cache

### Requirement: Vendored content is pinned to its published source

The vendored copy MUST record the upstream sha256 of every file it came from, and
validation MUST fail when a file's content no longer matches its recorded hash.

#### Scenario: A vendored file is edited by hand
- **WHEN** a file under the vendored standard differs from its recorded hash
- **THEN** validation fails, naming the file
- **AND** the message says to regenerate upstream rather than edit in place

#### Scenario: Content is loaded at runtime
- **WHEN** the application starts
- **THEN** it reads the vendored copy from disk and makes no network request

### Requirement: Content is available in every locale the standard publishes

Clause text, section titles, rationale and instructions MUST load in each
published locale, and a missing translation MUST fall back to the default locale
rather than rendering empty.

#### Scenario: A locale is fully translated
- **WHEN** content is requested in a published locale
- **THEN** clause text and section titles are returned in that locale

#### Scenario: A translation is missing
- **WHEN** a locale lacks a translation for one clause
- **THEN** the default-locale text is returned for that clause
- **AND** the result records that it is a fallback

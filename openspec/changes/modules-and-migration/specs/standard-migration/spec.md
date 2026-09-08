## ADDED Requirements

### Requirement: A version is not importable without a validated migration map

A standard version that supersedes another MUST ship a migration map naming, for
every clause key, how it changed: unchanged, renumbered, reworded, tightened,
split, merged, removed or added. Every key in the new version MUST appear in the
map, and every key in the old version MUST be accounted for. An unmapped key MUST
fail the build.

#### Scenario: A complete map
- **WHEN** the map accounts for every key in both versions
- **THEN** the check passes

#### Scenario: A key nobody mapped
- **WHEN** a key exists in the new version and not in the map
- **THEN** the check fails and names the key

#### Scenario: A split with one target
- **WHEN** a split names fewer than two clauses to split into
- **THEN** the check fails

#### Scenario: A target that does not exist
- **WHEN** a split or merge names a clause absent from the new version
- **THEN** the check fails

### Requirement: A community sees what a version would cost before deciding

A community MUST be able to preview a version it has not adopted: what changed,
grouped by change class, with the old and new text of each clause, and how many
of that community's own definitions each class affects. The preview MUST change
nothing, MUST be available without starting a migration, and MUST be exportable.

The same screen MUST be able to hide the community's own material, so it also
answers "what changed in the standard" for somebody not yet considering a
migration.

#### Scenario: A community opens the preview
- **WHEN** a steward previews a newer version
- **THEN** each changed clause is shown with its old and new text, grouped by class

#### Scenario: What it would cost us
- **WHEN** the preview is read by a community with adopted definitions
- **THEN** it says how many of those definitions each class affects

#### Scenario: The preview changes nothing
- **WHEN** the preview is opened and closed
- **THEN** no definition, decision, readiness figure or standard row has changed

#### Scenario: Taken to a meeting
- **WHEN** the preview is exported
- **THEN** it is readable without the application

### Requirement: A definition inherits the strictest change among its clauses

A definition answers a section, and a section owns clauses. Its change class MUST
be the strictest among those clauses, ordered removed, unchanged, renumbered,
reworded, tightened, merged, split.

#### Scenario: One reworded clause and one tightened clause
- **WHEN** a section owns both
- **THEN** the definition needs re-reading, because the stricter obligation governs

#### Scenario: Every clause unchanged
- **WHEN** none of a section's clauses changed
- **THEN** the definition carries forward without review

### Requirement: A migration runs over weeks, and the old version stays authoritative

Starting a migration MUST NOT change which version is in force. While one is in
flight, readiness MUST be available for both versions, and every existing
behaviour MUST continue against the version the community adopted.

#### Scenario: A migration is started
- **WHEN** a steward starts one
- **THEN** the adopted version is still the one in force, and both figures are visible

#### Scenario: The community works normally during it
- **WHEN** a decision is frozen while a migration is in flight
- **THEN** it is recorded against the version still in force

#### Scenario: Months pass
- **WHEN** a migration is left in flight
- **THEN** nothing expires it and no upgrade happens on its own

### Requirement: The review queue is worked through the community's own decision path

Every definition whose class is tightened, split or merged MUST appear in a review
queue and MUST be either re-affirmed or amended before the new version can be
adopted. A split MUST be able to offer the existing text as a starting draft in
each new section, as a draft and never as an adoption.

#### Scenario: A tightened obligation
- **WHEN** a definition's clause was tightened
- **THEN** it appears in the queue and blocks adoption until it is re-affirmed or amended

#### Scenario: A split offers a starting point
- **WHEN** a section was split in two
- **THEN** the existing text is offered as a draft in both, and neither is adopted by that

#### Scenario: Adoption with the queue unfinished
- **WHEN** adoption is attempted with items still pending
- **THEN** it is refused and says how many remain

### Requirement: One decision adopts the version, and history keeps its references

Adopting a new version MUST be a single decision that references the
re-affirmations made during the migration. On adoption, definitions that carried
forward MUST answer the new version, definitions whose clauses were removed MUST
be kept and marked as no longer required, the old version MUST be retired, and no
existing decision's clause references MUST change.

#### Scenario: The adopting decision
- **WHEN** it is frozen
- **THEN** the new version is in force, the old one is retired, and the decision names the re-affirmations

#### Scenario: A decision made under the old version
- **WHEN** it is read after the migration
- **THEN** it still quotes the version, reference and key it was made against

#### Scenario: A clause that was removed
- **WHEN** a definition answered a clause the new version dropped
- **THEN** the definition is kept, marked as no longer required by the new version, and not deleted

#### Scenario: A permalink
- **WHEN** a decision's URL from before the migration is opened
- **THEN** it resolves to the same decision

### Requirement: A migration can be abandoned, and abandoning keeps what was decided

Abandoning MUST be possible at any point before the adopting decision. It MUST
leave every adopted definition untouched, keep drafts, and keep the
re-affirmation decisions already made.

#### Scenario: A community changes its mind
- **WHEN** a migration is abandoned
- **THEN** the adopted version is unchanged and nothing adopted was altered

#### Scenario: What the re-affirmations were for
- **WHEN** a migration with re-affirmation decisions is abandoned
- **THEN** those decisions remain in the register

#### Scenario: Abandoning after adoption
- **WHEN** abandoning is attempted after the adopting decision
- **THEN** it is refused

## ADDED Requirements

### Requirement: The ordering rule is visible, editable and versioned

The weights that order a community's path MUST be stored as a settings object the
community can read and change, not as constants in the source. A change MUST
record who made it and when, and the previous weights MUST remain readable.

A community that has never opened the settings MUST have the same shape of record
as one that has, holding the defaults.

#### Scenario: A community looks at why its path is ordered as it is
- **WHEN** a member opens the path settings
- **THEN** they see the four weights and their current values
- **AND** they see that these are the defaults, if nobody has changed them

#### Scenario: A steward retunes the ordering
- **WHEN** a steward changes a weight
- **THEN** the path reorders
- **AND** the change records who made it and when
- **AND** the previous weights are still readable

#### Scenario: A member tries to retune it
- **WHEN** a member without permission to manage settings changes a weight
- **THEN** it is refused and the ordering is unchanged

### Requirement: Rank is computed from four inputs, each contributing visibly

An item's position MUST be a weighted sum of four contributions — structural
dependency, gap severity, risk profile, and what the community already has — and
each contribution MUST be available separately, not folded into one score.

Gap severity MUST be measured by how many countable clauses a section answers.
The standard the MVP ships against has no SHOULD clauses, and the path only ever
walks sections owning countable MUSTs, so ranking MUST above SHOULD would rank
nothing; the number of requirements a gap holds up is the same intent applied to
the content that exists.

#### Scenario: An item carries its own arithmetic
- **WHEN** the path is computed
- **THEN** each item reports what each of the four inputs contributed to it

#### Scenario: A weight set to zero removes its input
- **WHEN** the risk weight is zero
- **THEN** the risk profile changes nothing about the order
- **AND** the other three inputs still order the list

#### Scenario: One gap holds up more of the standard than another
- **WHEN** two sections are otherwise equal and one answers more countable clauses
- **THEN** the one answering more ranks higher

### Requirement: An item's stated reason comes from the same computation as its rank

The sentence explaining why an item is where it is MUST be derived from the
contributions that placed it. It MUST NOT be written or stored separately.

#### Scenario: The risk profile moved something up
- **WHEN** an item ranks highly because of the community's risk profile
- **THEN** its reason names the risk profile as the cause

#### Scenario: Nothing is blocking an item
- **WHEN** an item has no unanswered dependencies
- **THEN** its reason says so, rather than inventing another cause

#### Scenario: The weights change
- **WHEN** a weight is changed so that a different input dominates
- **THEN** the item's reason changes with its position

### Requirement: A community may overrule the ordering, and see what it overruled

A steward MUST be able to place an item by hand, and the override MUST survive
re-computation. The item MUST continue to show where the ordering would have put
it.

The first draft of this requirement said *a member*, which contradicts the
permission matrix P1 already settled: `path.reorder.private` is a member's own
view of the order, `path.publish` is putting an order in front of everybody, and
`path_override` is keyed by community rather than by member — so every placement
it can store is the second kind. A per-member ordering would need a column this
table does not have, and is not part of this change.

#### Scenario: A steward drags an item to the top
- **WHEN** an item is moved by hand
- **THEN** it stays there when the path is recomputed
- **AND** it shows both its placed position and its computed one

#### Scenario: A member tries to move one
- **WHEN** a member without `path.publish` places an item
- **THEN** it is refused and the ordering is unchanged

#### Scenario: An override is removed
- **WHEN** a steward clears an override
- **THEN** the item returns to its computed position

#### Scenario: Another community's path
- **WHEN** a steward of one community overrides an item
- **THEN** no other community's ordering changes

### Requirement: A community that changes nothing gets the previous behaviour

With default weights and no risk profile, the ordering MUST match the structural
ordering the path had before weighting existed: by how many questions are in the
way, then by layer.

This holds only for a particular shape of default, and the shape MUST be checked
rather than assumed. Encoding that key in one contribution scaled to `[0, 1]`
makes one layer worth the dependency weight divided by the standard's structural
positions, `(maxBlockers + 1) × layers − 1`. That step MUST outweigh everything
a day-one community can score, which is gap severity alone. The check MUST be
computed from the loaded standard, because both things that would break it — a
standard with more layers or deeper dependencies, and somebody rebalancing the
defaults to look tidier — would otherwise break it silently.

#### Scenario: A community that has answered no questions
- **WHEN** the path is computed with defaults and no risk profile
- **THEN** items waiting on more unanswered questions rank below those waiting on fewer
- **AND** within that, earlier layers come first

#### Scenario: The defaults are rebalanced
- **WHEN** the default weights no longer satisfy that condition against the loaded standard
- **THEN** the build fails, rather than the ordering quietly changing

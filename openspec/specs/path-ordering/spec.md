# path-ordering Specification

## Purpose
Covers the order a community's work is presented in: the four weights that produce it, stored as a settings object the community can read, change and look back on; the four contributions each item carries separately so its stated reason comes from the same arithmetic as its rank; the steward's hand-placed override and the computed position it continues to show; and the check that a community changing nothing still gets the structural ordering the path had before weighting existed.
## Requirements
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

### Requirement: A member's own order is theirs until a steward publishes it

Any member MUST be able to reorder the path for themselves. That order MUST NOT
be visible to anybody else, and MUST be discardable in one act. Only a steward
MUST be able to publish it as the community's order, and publishing MUST be
recorded in the change log with who did it.

#### Scenario: A member moves something
- **WHEN** a member with `path.reorder.private` places an item
- **THEN** their own path shows it there, marked as their placement
- **AND** no other member's path changes

#### Scenario: A member tries to publish
- **WHEN** a member without `path.publish` publishes their order
- **THEN** it is refused and their draft is left intact rather than half-applied

#### Scenario: A steward publishes their order
- **WHEN** a steward publishes
- **THEN** every member's path shows those placements as the community's
- **AND** the steward's draft is empty
- **AND** the change log records who published and how many placements

#### Scenario: A draft is discarded
- **WHEN** a member discards their order
- **THEN** their path returns to the community's, and nothing else changes

### Requirement: Named starting points set the four weights, and say what they keep

The path MUST offer named starting points that write the ordinary weights rather
than a second ordering. Each one MUST leave the structural inputs at their
shipped values, so that choosing one cannot quietly stop the list being workable
in order.

#### Scenario: A steward picks a starting point
- **WHEN** a named starting point is applied
- **THEN** the weights change, visibly, on the screen that explains them
- **AND** `defaultsPreserveStructure` still holds

### Requirement: A community may overrule the ordering, and see what it overruled

A steward MUST be able to place an item by hand, and the override MUST survive
re-computation. The item MUST continue to show where the ordering would have put
it.

Both halves of the permission matrix now exist. `path.reorder.private` is a
member's own view of the order and writes to `path_private_override`, which is
keyed by member as well as by community; `path.publish` is putting an order in
front of everybody and writes to `path_override`, which is keyed by community
alone. The earlier note here said the per-member half needed a column the table
did not have; it has its own table instead.

#### Scenario: A steward drags an item to the top
- **WHEN** an item is moved by hand
- **THEN** it stays there when the path is recomputed
- **AND** it shows both its placed position and its computed one

#### Scenario: A member tries to place an item for everybody
- **WHEN** a member without `path.publish` writes to the community's order
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

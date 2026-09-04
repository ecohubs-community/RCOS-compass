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

#### Scenario: An item carries its own arithmetic
- **WHEN** the path is computed
- **THEN** each item reports what each of the four inputs contributed to it

#### Scenario: A weight set to zero removes its input
- **WHEN** the risk weight is zero
- **THEN** the risk profile changes nothing about the order
- **AND** the other three inputs still order the list

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

A member MUST be able to place an item by hand, and the override MUST survive
re-computation. The item MUST continue to show where the ordering would have put
it.

#### Scenario: A member drags an item to the top
- **WHEN** an item is moved by hand
- **THEN** it stays there when the path is recomputed
- **AND** it shows both its placed position and its computed one

#### Scenario: An override is removed
- **WHEN** a member clears an override
- **THEN** the item returns to its computed position

#### Scenario: Another community's path
- **WHEN** a member of one community overrides an item
- **THEN** no other community's ordering changes

### Requirement: A community that changes nothing gets the previous behaviour

With default weights and no risk profile, the ordering MUST match the structural
ordering the path had before weighting existed: unblocked items first, then by
layer.

#### Scenario: A community that has answered no questions
- **WHEN** the path is computed with defaults and no risk profile
- **THEN** items whose dependencies are unanswered rank below those whose are not
- **AND** within that, earlier layers come first

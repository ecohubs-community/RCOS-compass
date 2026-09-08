## ADDED Requirements

### Requirement: A module is a standard that declares what it extends

A standard MUST declare whether it is the core or a module, which layers a module
extends, and which standards it conflicts with. A standard that declares none of
these MUST load as the core with no conflicts, so an existing standard is
unaffected.

#### Scenario: A module is loaded
- **WHEN** a standard declaring itself a module is loaded
- **THEN** its kind, the layers it extends and its conflicts are available

#### Scenario: A standard that declares nothing
- **WHEN** a standard with none of those fields is loaded
- **THEN** it is the core, extends nothing and conflicts with nothing

#### Scenario: A module owning a core clause
- **WHEN** a module's section claims a clause belonging to the core
- **THEN** loading it fails, because a clause has one owner within its own standard and a module may reference core clauses but never own them

### Requirement: Adopting a module is a governance act, not a setting

Adopting a module MUST produce a decision record and MUST NOT be possible without
one. The community_standard row for the module MUST reference the decision that
adopted it.

#### Scenario: A community adopts a module
- **WHEN** the adopting decision is frozen
- **THEN** the module becomes active for that community and the row names that decision

#### Scenario: An attempt to adopt without a decision
- **WHEN** something tries to make a module active with no adopting decision
- **THEN** it is refused

#### Scenario: A member adopts
- **WHEN** somebody without permission to record a decision tries to adopt a module
- **THEN** it is refused and nothing is adopted

### Requirement: Two modules that conflict cannot both be adopted

A community MUST NOT hold two modules that conflict. Adopting one that names an
already-adopted module in its conflicts — or that an already-adopted module names
— MUST be refused, and the refusal MUST name the module already in force.

#### Scenario: The second of a conflicting pair
- **WHEN** a community with one variant adopted tries to adopt the other
- **THEN** it is refused, naming the adopted one

#### Scenario: The conflict is declared by the other side
- **WHEN** only the already-adopted module names the conflict
- **THEN** adopting is still refused

#### Scenario: Two modules that do not conflict
- **WHEN** a community adopts two unrelated modules
- **THEN** both are active

### Requirement: A module's figures are never part of the core claim

Readiness and completeness MUST be computed once per adopted standard and MUST
NOT be combined. The outward compliance claim MUST be computed from the core
standard alone, and no module figure MUST appear inside it, on any surface.

#### Scenario: A module complete, the core not
- **WHEN** a community has a module at every artifact complete and mandatory core artifacts missing
- **THEN** it reads as not compliant, on the dashboard, in the export and on the public page

#### Scenario: The public index of a community with modules
- **WHEN** an anonymous visitor reads it
- **THEN** the core claim appears first and adopted modules appear in a separate block

#### Scenario: A module figure on a public surface
- **WHEN** a module's readiness percentage is placed on anything a public surface renders
- **THEN** the public-surface test fails

#### Scenario: Each module's own state
- **WHEN** a member reads the community's standards
- **THEN** each module has its own figure, labelled with the module's name

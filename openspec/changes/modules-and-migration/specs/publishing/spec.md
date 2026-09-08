## ADDED Requirements

### Requirement: The public index shows the core claim first, and modules separately

The public surface MUST show the core compliance claim before anything about
modules, and MUST show adopted modules in a clearly separate block. A module's
state MUST be binary there, like the core claim, and no module percentage MUST
appear on a public surface.

#### Scenario: A community with an adopted module
- **WHEN** an anonymous visitor reads the public index
- **THEN** the core claim appears first and the module appears in its own block

#### Scenario: A module complete, the core not
- **WHEN** the community is not core-compliant and the module is complete
- **THEN** the page says it is not yet compliant, and nothing about the module contradicts that

#### Scenario: A module percentage
- **WHEN** a module's readiness figure is placed on a public route's data
- **THEN** the public-surface test fails

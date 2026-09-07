## ADDED Requirements

### Requirement: A community holds its own publishing and mirror settings

A community MUST hold an attribution policy for publishing, and the settings for
its git mirror. Both MUST be changeable by a steward and readable by every
member, so a community can see how it presents itself outwardly.

#### Scenario: A steward changes the attribution policy
- **WHEN** the policy is changed
- **THEN** what the public surface shows changes accordingly, subject to individual consent

#### Scenario: A member reads the settings
- **WHEN** a member opens the community's settings
- **THEN** they can see the attribution policy and whether a remote is linked

#### Scenario: A member tries to change them
- **WHEN** a member without permission changes either
- **THEN** it is refused and nothing changes

### Requirement: A public route resolves a community without a session

The public surface MUST resolve the community from the URL with no session and no
membership, MUST serve only world-visible content, and MUST behave identically
for a visitor who happens to be signed in to a different community.

#### Scenario: An anonymous visitor opens a public index
- **WHEN** they request it with no session
- **THEN** the community's world-visible content is served

#### Scenario: A signed-in member of another community opens it
- **WHEN** a member of community B opens community A's public index
- **THEN** they see exactly what an anonymous visitor sees

#### Scenario: A community that has published nothing
- **WHEN** its public index is requested
- **THEN** the response says the community has published nothing, and reveals no member-visible content

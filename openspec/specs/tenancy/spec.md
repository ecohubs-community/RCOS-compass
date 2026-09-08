# tenancy Specification

## Purpose
Defines the tenant boundary: the community is resolved from the URL rather than the session, non-membership is indistinguishable from non-existence, every service filters by the resolved community, membership changes take effect on the next request, and a new community arrives with somewhere to put its own agreements.
## Requirements
### Requirement: The community is resolved from the URL, never from the session

A request's community MUST be determined from the URL path. The session MUST NOT
carry an active community, because a session-held tenant is how a request ends up
reading a community the user never asked for.

#### Scenario: A member opens a community they belong to
- **WHEN** a signed-in member requests a path under their community
- **THEN** the request is scoped to that community
- **AND** their membership and role for it are available to the handler

#### Scenario: A member switches community
- **WHEN** the same member requests a path under a different community they belong to
- **THEN** the request is scoped to the second community
- **AND** nothing about the first is carried over

#### Scenario: The community does not exist
- **WHEN** a request names a community slug that does not exist
- **THEN** the response is 404

### Requirement: A community another user belongs to is indistinguishable from one that does not exist

A request for a community the user is not a member of MUST return 404, not 403,
so that existence is not disclosed across the tenant boundary.

#### Scenario: A signed-in user requests a community they do not belong to
- **WHEN** the community exists but the user has no membership in it
- **THEN** the response is 404
- **AND** the response body does not reveal that the community exists

#### Scenario: A suspended community
- **WHEN** a member requests a community that has been suspended
- **THEN** they may read and export, and are told it is suspended
- **AND** no write is accepted

#### Scenario: A deleted community
- **WHEN** a member requests a community that has been soft-deleted
- **THEN** the response is 404

### Requirement: Services filter by the resolved community

Every service that reads or writes tenant-owned data MUST take the resolved
community from its context and filter on it. A service MUST NOT accept a
community identifier from client input.

#### Scenario: A resource id from another community is supplied
- **WHEN** a member of community B calls a service with the id of a resource in community A
- **THEN** the service behaves as though the resource does not exist
- **AND** community A's data is not returned or modified

#### Scenario: Every service is covered
- **WHEN** the cross-tenant suite runs
- **THEN** it exercises every registered service
- **AND** a service missing from the registry fails the suite

### Requirement: Membership changes take effect immediately

Authorisation MUST be evaluated against current membership on every request, not
against a claim captured when the session began.

#### Scenario: A member is removed while signed in
- **WHEN** a steward removes a member who has an active session
- **THEN** that member's next request to the community is refused
- **AND** they are not required to sign out first

#### Scenario: A role is changed while signed in
- **WHEN** a steward demotes another steward to member
- **THEN** the demoted user's next request is evaluated with the member role

### Requirement: A community is created with somewhere to put its own agreements

Creating a community MUST also create a local artifact for the community's own
agreements, in the same transaction, so a community never has to build a
container before writing its first rule.

#### Scenario: A tenant is created
- **WHEN** a community is created
- **THEN** it has a local artifact ready to hold definitions

#### Scenario: The creating transaction fails
- **WHEN** community creation fails after the community row is prepared
- **THEN** neither the community nor the local artifact exists

#### Scenario: Another community requests it
- **WHEN** a member of a different community requests that artifact by id
- **THEN** the answer is the same as for one that does not exist

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

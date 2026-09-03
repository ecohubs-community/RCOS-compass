## ADDED Requirements

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

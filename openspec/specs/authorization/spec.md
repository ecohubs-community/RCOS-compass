# authorization Specification

## Purpose
Defines what a signed-in user may do: a single capability-to-roles matrix consulted through one shared function, the member/steward split between proposing and recording, and the requirement that every server load, action and endpoint authorises explicitly.
## Requirements
### Requirement: Every capability decision comes from one matrix

Permissions MUST be expressed as a single capability-to-roles map, and every
authorisation decision MUST be made by one shared function reading it. A handler
MUST NOT compare roles inline.

#### Scenario: The matrix is asserted in full
- **WHEN** the permission test runs
- **THEN** every (role, capability) pair is asserted to allow or deny

#### Scenario: A capability is added without a matrix entry
- **WHEN** a new capability is introduced and not added to the matrix
- **THEN** the permission test fails

#### Scenario: A role check is written inline
- **WHEN** a route or component compares a role directly instead of asking for a capability
- **THEN** the lint rule fails the build

### Requirement: Members propose and stewards record

The two roles MUST divide along that line: everything that produces a proposal is
available to a member, and everything that produces authority is not.

#### Scenario: A member acts within their role
- **WHEN** a member opens a discussion, drafts a definition, uploads a document, or reorders their own Path
- **THEN** the action is permitted

#### Scenario: A member attempts an act of authority
- **WHEN** a member tries to freeze a decision, publish, invite, or change settings
- **THEN** the action is refused

#### Scenario: Ownership is a flag, not a role
- **WHEN** a role is assigned or an invitation is created naming `owner`
- **THEN** it is rejected, because owner is a flag on one membership

#### Scenario: Only the owner may transfer or delete
- **WHEN** a steward without the owner flag attempts to transfer ownership or delete the community
- **THEN** the action is refused

### Requirement: Every server load and action authorises

Every server load, action and endpoint MUST make an explicit permission check
before reading or writing anything, in both the authenticated and admin route
groups.

#### Scenario: A route omits its check
- **WHEN** a server route file contains no permission call
- **THEN** the guard test fails, naming the file

#### Scenario: An unauthenticated request reaches a guarded route
- **WHEN** a request with no session hits any authenticated route
- **THEN** it is refused rather than served

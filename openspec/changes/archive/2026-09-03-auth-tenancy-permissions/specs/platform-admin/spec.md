## ADDED Requirements

### Requirement: The admin console is reachable only by a verified, listed, two-factor admin

Access MUST require a verified email listed in configuration and an enrolled
second factor, checked on every request.

#### Scenario: An ordinary member requests an admin route
- **WHEN** a signed-in member or steward requests any admin path
- **THEN** the response is 404

#### Scenario: An unauthenticated request
- **WHEN** a request with no session hits an admin path
- **THEN** the response is 404

#### Scenario: The configuration no longer lists the address
- **WHEN** an address is removed from the admin list and the process restarts
- **THEN** that user's next admin request is refused

### Requirement: Platform admins see tenant metadata, never community content

Admin services MUST NOT read definitions, discussions, documents, decisions, or
member personal data beyond the owner's contact address.

#### Scenario: The admin service boundary is inspected
- **WHEN** the admin services are checked for imports of content services or tables
- **THEN** none are found

#### Scenario: A tenant is viewed
- **WHEN** an admin opens a community's detail page
- **THEN** they see name, slug, status, member counts, usage and limits
- **AND** they see no governance content

### Requirement: Creating a tenant invites an owner without making the admin a member

Creating a community MUST invite an owner by email rather than granting the
acting admin any membership in it.

#### Scenario: A community is created
- **WHEN** an admin creates a community with an owner address
- **THEN** exactly one community, one pending steward invitation carrying the owner flag, and one default local artifact exist
- **AND** the admin holds no membership in it
- **AND** an audit event records the creation

#### Scenario: A reserved or duplicate slug
- **WHEN** the slug is already taken or is a reserved word
- **THEN** creation is refused with a message naming the problem

### Requirement: Destructive actions are deliberate, reversible and recorded

Suspension and deletion MUST require confirmation and a reason, MUST be audit
logged, and deletion MUST be recoverable for a grace period.

#### Scenario: A community is suspended
- **WHEN** an admin suspends a community with a reason
- **THEN** members may still read and export, writes are refused, and an audit event records the reason

#### Scenario: A community is deleted and restored
- **WHEN** an admin soft-deletes a community and then restores it within the grace period
- **THEN** the community and its data are intact

#### Scenario: Every admin action is recorded
- **WHEN** any admin action changes state
- **THEN** an audit event records the actor, address, IP, target and change

# authentication Specification

## Purpose
Establishes who a request belongs to: how a session is created from a verified email, how it is bounded and revoked, how credentials are protected against guessing and enumeration, and when a second factor is required.
## Requirements
### Requirement: A session is established by a verified email

A user MUST verify their email before their session can do anything beyond
managing their own account.

#### Scenario: An unverified user signs in
- **WHEN** a user with an unverified email signs in and requests a community
- **THEN** they are directed to verify, and the community is not served

#### Scenario: Verification completes
- **WHEN** the user follows a valid verification link
- **THEN** their subsequent requests are served normally

### Requirement: Sessions are revocable and bounded

Sessions MUST be stored server-side, expire, and be revocable.

#### Scenario: A session is revoked
- **WHEN** a session is revoked
- **THEN** the next request carrying it is refused

#### Scenario: A session outlives its absolute lifetime
- **WHEN** a session older than its absolute maximum is presented
- **THEN** it is refused regardless of recent activity

#### Scenario: Cookies are hardened
- **WHEN** a session cookie is issued
- **THEN** it is HttpOnly and SameSite=Lax, and Secure in production

### Requirement: Credentials are protected against guessing and enumeration

Authentication attempts MUST be rate limited, and failures MUST NOT reveal
whether an account exists.

#### Scenario: Repeated failed sign-ins
- **WHEN** sign-in is attempted repeatedly for the same address
- **THEN** further attempts are refused for a period
- **AND** the refusals are recorded as audit events

#### Scenario: An unknown address is used
- **WHEN** sign-in or password reset is requested for an address with no account
- **THEN** the response is indistinguishable from one for an existing account

### Requirement: Platform admins must hold a second factor

A user whose verified email is listed as a platform admin MUST have TOTP enrolled
before reaching any admin route.

#### Scenario: An admin without a second factor
- **WHEN** an admin-email user without TOTP requests an admin route
- **THEN** they are sent to enrolment and the route is not served

#### Scenario: An ordinary member without a second factor
- **WHEN** a member without TOTP uses the application
- **THEN** nothing is withheld from them

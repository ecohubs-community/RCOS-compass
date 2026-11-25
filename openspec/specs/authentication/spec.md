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
before reaching any admin route other than the console's own Two-factor panel, which
MUST remain reachable to them so that enrolment is possible, and MUST answer 404 to
anybody who is not a listed admin.

#### Scenario: An admin without a second factor
- **WHEN** an admin-email user without TOTP requests an admin route
- **THEN** they are sent to enrolment and the route is not served

#### Scenario: The enrolment panel for somebody who is not an admin
- **WHEN** anybody who is not a listed admin requests the console's Two-factor panel
- **THEN** the answer is 404, the same as for any other admin route

#### Scenario: An ordinary member without a second factor
- **WHEN** a member without TOTP uses the application
- **THEN** nothing is withheld from them

### Requirement: An erased account cannot be signed in to, and its address is free

After erasure, no credential, session or verification token MUST remain that
could authenticate as that account, and the address the person used MUST be
available for a new registration.

A sign-in attempt against an erased account MUST be indistinguishable from one
against an account that never existed.

#### Scenario: A password that used to work
- **WHEN** the erased person's former credentials are presented
- **THEN** authentication fails

#### Scenario: A session held open across the erasure
- **WHEN** a request carries a session issued before the erasure
- **THEN** it is refused

#### Scenario: The address is registered again
- **WHEN** somebody signs up with the address the erased person used
- **THEN** registration succeeds and creates an unrelated account

#### Scenario: Enumeration
- **WHEN** sign-in is attempted against an erased account
- **THEN** the response is the same as for an address that was never registered

### Requirement: No account is made without an invitation or a join link

The application MUST NOT create an account from a public request other than
accepting an invitation or submitting a community's working join link. The
library's public sign-up endpoints MUST answer 404 however the path is spelled,
and a magic link sent to an address with no account MUST NOT create one when
followed. Accepting an invitation MUST still create the account, verified. An
account created through a join link MUST NOT be verified until its address is,
and MUST have no password until the person signed in by its verification mail
chooses one.

#### Scenario: Public sign-up
- **WHEN** anybody posts to `/api/auth/sign-up/email`, in any spelling of the path
- **THEN** the answer is 404 and no account or mail is created

#### Scenario: A magic link to an unknown address
- **WHEN** a sign-in link is requested for an address with no account and then followed
- **THEN** the request answers as for any address, and no account is created

#### Scenario: An invitation
- **WHEN** an invited person accepts and creates their account
- **THEN** the account is created and they are signed in, as before

#### Scenario: A join link
- **WHEN** someone creates an account through a community's working join link
- **THEN** the account exists, unverified and with no password, and cannot be signed in to until the address is verified

#### Scenario: A join link that does not work
- **WHEN** someone submits the form of a join link that was turned off or replaced
- **THEN** no account is created

### Requirement: Signing in without a destination lands in the person's community

Sign-in without a requested destination MUST land a person who is a current
member of exactly one community on that community's dashboard. A person in no community, or in several, MUST arrive on the front
page. A requested destination MUST still be honoured, including the front page,
and MUST still be limited to a path on this site.

#### Scenario: One community
- **WHEN** a member of exactly one community signs in from `/sign-in`
- **THEN** they arrive on that community's dashboard

#### Scenario: Two communities
- **WHEN** a member of two communities signs in from `/sign-in`
- **THEN** they arrive on the front page, whose account menu lists both

#### Scenario: No community
- **WHEN** a person who belongs to no community signs in
- **THEN** they arrive on the front page

#### Scenario: A destination was asked for
- **WHEN** a member of one community signs in from a link that asked to return to a decision
- **THEN** they arrive on that decision

#### Scenario: After a second factor
- **WHEN** a member of one community with two-factor enrolled completes the second step, with no destination asked for
- **THEN** they arrive on that community's dashboard

#### Scenario: Waiting to be let in
- **WHEN** a person in no community, with an open join request, signs in
- **THEN** they arrive on the page that says they are waiting

#### Scenario: A community that has been deleted
- **WHEN** a person whose only membership is in a deleted community signs in
- **THEN** they arrive on the front page

#### Scenario: Already signed in
- **WHEN** a signed-in member of one community opens `/sign-in`
- **THEN** they are taken to that community's dashboard


## RENAMED Requirements

- FROM: `### Requirement: No account is made without an invitation`
- TO: `### Requirement: No account is made without an invitation or a join link`

## MODIFIED Requirements

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

## ADDED Requirements

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

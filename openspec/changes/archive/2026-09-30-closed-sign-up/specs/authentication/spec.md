## ADDED Requirements

### Requirement: No account is made without an invitation

The application MUST NOT create an account from a public request other than
accepting an invitation. The library's public sign-up endpoints MUST answer 404
however the path is spelled, and a magic link sent to an address with no account
MUST NOT create one when followed. Accepting an invitation MUST still create the
account.

#### Scenario: Public sign-up
- **WHEN** anybody posts to `/api/auth/sign-up/email`, in any spelling of the path
- **THEN** the answer is 404 and no account or mail is created

#### Scenario: A magic link to an unknown address
- **WHEN** a sign-in link is requested for an address with no account and then followed
- **THEN** the request answers as for any address, and no account is created

#### Scenario: An invitation
- **WHEN** an invited person accepts and creates their account
- **THEN** the account is created and they are signed in, as before

# runtime-config Specification

## Purpose
TBD - created by archiving change scaffold-project. Update Purpose after archive.
## Requirements
### Requirement: Configuration is validated once, at boot

All server configuration MUST be read through a single module that parses the
environment with a schema at startup. The application MUST refuse to start when a
required variable is missing or malformed, and no other module MUST read
`process.env`.

#### Scenario: A required variable is missing
- **WHEN** the application starts without `BETTER_AUTH_SECRET`
- **THEN** it exits non-zero before accepting any request
- **AND** the error names the variable and what it is for
- **AND** the error does not print the value of any other secret

#### Scenario: A variable has the wrong shape
- **WHEN** `MAX_UPLOAD_MB` is set to `"twenty"`
- **THEN** startup fails with a message naming the variable and the expected type

#### Scenario: An optional variable is absent
- **WHEN** `AI_API_KEY` is unset and `AI_PROVIDER` is `null`
- **THEN** the application starts normally
- **AND** AI features report themselves as unavailable rather than failing on use

#### Scenario: Config is read outside the module
- **WHEN** a source file other than the config module references `process.env`
- **THEN** the lint rule fails the build

### Requirement: Secrets never reach the client

Configuration marked secret MUST be importable only from server code, and MUST
NOT appear in any client bundle.

#### Scenario: A secret is imported into a component
- **WHEN** a `.svelte` file imports the server config module
- **THEN** the build fails

#### Scenario: The client bundle is inspected
- **WHEN** the production client bundle is searched for the values of
  `BETTER_AUTH_SECRET`, `AI_API_KEY` and `SMTP_URL`
- **THEN** none of them appear

### Requirement: Platform admin identity comes from the environment at request time

`ADMIN_EMAILS` MUST be compared against the requesting user's verified email on
every request. It MUST NOT be cached in a session and MUST NOT be stored in the
database, so that revoking an address takes effect on the next request rather
than at the next login.

#### Scenario: An address is removed from ADMIN_EMAILS
- **WHEN** an address is removed and the process restarts
- **THEN** that user's next request to an admin route is refused

#### Scenario: The email is not verified
- **WHEN** a user whose email appears in `ADMIN_EMAILS` has not verified it
- **THEN** they are not treated as a platform admin

#### Scenario: Case and whitespace differ
- **WHEN** `ADMIN_EMAILS` contains ` Person@Example.org ` and the user's verified
  email is `person@example.org`
- **THEN** they are treated as a platform admin


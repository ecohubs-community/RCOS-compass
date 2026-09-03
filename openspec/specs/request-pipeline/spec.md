# request-pipeline Specification

## Purpose
TBD - created by archiving change scaffold-project. Update Purpose after archive.
## Requirements
### Requirement: Every request carries an identity that reaches the logs

Every request MUST be assigned an id that appears on each log line for it, and
log lines MUST carry the resolved community and actor when there is one. Logs
MUST NOT contain definition bodies, discussion text, document contents, or
personal data.

#### Scenario: A request is served
- **WHEN** any request is handled
- **THEN** a request id is generated and attached to every log line for it
- **AND** the log line records the route and the outcome

#### Scenario: A request is scoped to a community
- **WHEN** a request resolves to a community and a signed-in user
- **THEN** the log lines for it carry the community and user identifiers

#### Scenario: Log lines are inspected for content
- **WHEN** logs are searched for definition bodies, discussion text, document
  contents, or email addresses
- **THEN** none appear

### Requirement: Security headers are set on every response

Every response MUST carry a Content-Security-Policy built with a per-request
nonce, and MUST NOT permit `unsafe-inline`.

#### Scenario: An HTML response is returned
- **WHEN** any page is served
- **THEN** it carries a Content-Security-Policy with a per-request nonce,
  `default-src 'self'`, no `unsafe-inline`, `frame-ancestors 'none'` and
  `object-src 'none'`
- **AND** it carries `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: same-origin`

#### Scenario: The application runs in production mode
- **WHEN** the application is built for production
- **THEN** responses additionally carry HSTS

#### Scenario: An inline script has no nonce
- **WHEN** a page renders an inline script without the request's nonce
- **THEN** the browser blocks it and the test fails

### Requirement: Unexpected errors reveal nothing

An unhandled error MUST return a generic message and the request id. The response
MUST NOT contain a stack trace, SQL, a file path, or exception text.

#### Scenario: A handler throws
- **WHEN** an unhandled error occurs
- **THEN** the response contains a generic message and the request id
- **AND** it contains no stack trace, SQL, file path, or exception text
- **AND** the full error is written to the log against that request id

#### Scenario: An error page is rendered
- **WHEN** an error page is shown to a signed-in user
- **THEN** the application shell is still present so they can navigate away

### Requirement: The instance reports its own health

The application MUST expose an unauthenticated health endpoint reporting build
and database state, and that endpoint MUST NOT disclose configuration values,
secrets, or community data.

#### Scenario: The health endpoint is called
- **WHEN** `GET /healthz` is requested without authentication
- **THEN** it returns the build SHA, the applied migration version, and database
  reachability
- **AND** it returns no configuration values, secrets, or community data

#### Scenario: The database is unreachable
- **WHEN** the database cannot be reached
- **THEN** `/healthz` returns a non-200 status

### Requirement: Requests are rate limited per client and per user

Dynamic requests MUST be limited per client address, and authenticated requests
MUST additionally be limited per user, so that one member cannot exhaust a
community's capacity.

#### Scenario: An unauthenticated client exceeds its ceiling
- **WHEN** a client makes more dynamic requests than the per-address ceiling
- **THEN** further requests are refused with 429 and a Retry-After header

#### Scenario: One member is noisy
- **WHEN** a signed-in member exceeds their own ceiling
- **THEN** their requests are refused
- **AND** other members of the same community are unaffected

#### Scenario: Health and assets are exempt
- **WHEN** the health endpoint or a built asset is requested repeatedly
- **THEN** it is never rate limited


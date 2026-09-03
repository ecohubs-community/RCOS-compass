## MODIFIED Requirements

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

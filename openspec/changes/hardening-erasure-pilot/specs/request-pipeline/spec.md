## MODIFIED Requirements

### Requirement: Unexpected errors reveal nothing

An unhandled error MUST return a generic message and the request id. The response
MUST NOT contain a stack trace, SQL, a file path, or exception text.

The error MUST also be recorded on the instance under the same request id, so
that an operator can find it later without reading a log file. Recording MUST NOT
change the response, and a failure to record MUST NOT fail the request.

#### Scenario: A handler throws
- **WHEN** an unhandled error occurs
- **THEN** the response contains a generic message and the request id
- **AND** it contains no stack trace, SQL, file path, or exception text
- **AND** the full error is written to the log against that request id
- **AND** a scrubbed record of it is stored against the same request id

#### Scenario: An error page is rendered
- **WHEN** an error page is shown to a signed-in user
- **THEN** the application shell is still present so they can navigate away

#### Scenario: Recording the error fails
- **WHEN** the error record cannot be written
- **THEN** the response is unchanged and the request completes

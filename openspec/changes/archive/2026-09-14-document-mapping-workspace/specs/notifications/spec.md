## ADDED Requirements

### Requirement: A member is told when a job they started has finished

A member MUST receive an in-app notification when a background job they started
reaches its end — an export ready, a document scan complete or stopped — even
though their own act started it. The notification MUST be
written in the transaction that records the job's outcome, and MUST NOT be written
for a member whose membership has ended.

#### Scenario: An export is ready
- **WHEN** the export a member requested is built
- **THEN** that member has an `export.ready` notification

#### Scenario: A scan completes
- **WHEN** the scan a member started completes
- **THEN** that member has a notification naming the document and how many passages await review

#### Scenario: A scan stops on a budget
- **WHEN** the scan a member started stops because their budget ran out
- **THEN** that member has a notification naming the document and the reason

#### Scenario: Other members
- **WHEN** a scan started by one member completes
- **THEN** no other member receives a notification about it

#### Scenario: The member left before the scan ended
- **WHEN** a scan ends after the member who started it left the community
- **THEN** no notification is written

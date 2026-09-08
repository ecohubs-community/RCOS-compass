## ADDED Requirements

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

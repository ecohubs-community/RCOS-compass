## ADDED Requirements

### Requirement: The contact address is optional and checked

`CONTACT_EMAIL` MUST be optional and default to empty. When it is set, the
application MUST refuse to start unless it is an email address, naming the
variable, and MUST use the trimmed value.

#### Scenario: Not set
- **WHEN** the application starts without `CONTACT_EMAIL`
- **THEN** it starts, and the landing page offers no request-access link

#### Scenario: Not an email address
- **WHEN** `CONTACT_EMAIL` is `hello at example dot org`
- **THEN** the application refuses to start and the error names `CONTACT_EMAIL`

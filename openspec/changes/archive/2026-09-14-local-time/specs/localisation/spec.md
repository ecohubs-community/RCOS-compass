## MODIFIED Requirements

### Requirement: A community chooses its locale, and can change it

A steward MUST be able to set the community's locale and its time zone, and changing
either MUST change only how the interface, the standard and calendar dates are shown,
and nothing else.

#### Scenario: A steward changes the locale
- **WHEN** the locale is changed from English to German
- **THEN** the interface and standard content are German for every member

#### Scenario: Changing it touches nothing else
- **WHEN** the locale changes
- **THEN** readiness, compliance, the register and every definition are unchanged

#### Scenario: A steward changes the time zone
- **WHEN** a steward changes the community's time zone from UTC to Europe/Berlin
- **THEN** calendar dates and the times shown to members without their own time zone follow Berlin, and no stored moment or decision reference changes

#### Scenario: A member tries to change it
- **WHEN** a member who is not a steward submits a time zone for the community
- **THEN** the change is refused and the time zone is unchanged

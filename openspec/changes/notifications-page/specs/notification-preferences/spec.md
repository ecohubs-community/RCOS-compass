## ADDED Requirements

### Requirement: A member controls their own email for each community

Each member MUST be able to turn email off and to choose their digest day,
separately for each community they belong to, on a notifications settings screen.
Email MUST be on, with a Monday digest, until they change it. A member MUST only be
able to change their own preferences. In-application notifications MUST NOT be
able to be turned off.

#### Scenario: Turning email off
- **WHEN** Lena turns email off in Valle Verde
- **THEN** she receives no digest and no immediate email from Valle Verde, and still sees notifications in the application

#### Scenario: Another community
- **WHEN** Lena has turned email off in Valle Verde and is also a member of Fruit Haven
- **THEN** her email from Fruit Haven is unchanged

#### Scenario: Choosing a day
- **WHEN** Lena, whose time zone is Europe/Lisbon, chooses Thursday
- **THEN** her next digest from that community is sent on a Thursday morning in Lisbon

#### Scenario: Where the day is counted
- **WHEN** Lena opens the notification settings
- **THEN** the screen names the time zone her digest follows and links to where she can change it

#### Scenario: Someone else's preferences
- **WHEN** a steward submits preferences for another member
- **THEN** only the steward's own preferences can change, and the other member's are untouched

#### Scenario: A former member
- **WHEN** a person whose membership has ended requests the settings screen
- **THEN** the answer is the same as for a community that does not exist

### Requirement: Every email says where to change it

Every notification and digest email MUST include a link to the member's
notification settings for that community. Invitation and account emails, which
are sent before or outside a membership, MUST NOT be governed by these
preferences.

#### Scenario: A digest
- **WHEN** a member receives a digest
- **THEN** it links to their notification settings for that community

#### Scenario: An invitation
- **WHEN** a person who turned email off in one community is invited to another
- **THEN** the invitation is still sent

#### Scenario: A sign-in email
- **WHEN** a member who turned email off everywhere requests a password reset
- **THEN** the reset email is still sent

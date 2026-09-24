# account-settings Specification

## Purpose
Where a person manages their own account: an Account, a Two-factor authentication and a Time zone panel, shown as a section of every community's settings and in the admin console's settings, reached from a menu beside their name. The name set there is the one every surface prints.

## Requirements
### Requirement: Every member reaches their own account from the menu beside their name

The community shell MUST show, beside the reader's name, a menu offering Preferences and
Sign out. Preferences MUST open the Account panel of that community's settings, and the
Account, Two-factor authentication and Time zone panels MUST be open to every member
whatever their role. Without JavaScript, Preferences MUST be a link and Sign out a
button that posts.

#### Scenario: A member opens Preferences
- **WHEN** a member chooses Preferences from the menu beside their name
- **THEN** the Account panel of the community's settings opens

#### Scenario: Signing out from the menu
- **WHEN** a signed-in person chooses Sign out from the menu
- **THEN** their session ends and they are shown the sign-in page

#### Scenario: Without JavaScript
- **WHEN** the page is used with JavaScript off
- **THEN** Preferences is a link and Sign out is a button, and both work

### Requirement: A person can change their own name, and every surface prints it

The Account panel MUST let a person change the name on their account, under the same
rule as the name given when accepting an invitation, and MUST refuse an empty or
over-long name beside the field without changing the stored one. The new name MUST be
the one every surface that names the person prints afterwards. The panel MUST show
the account's email address without letting it be changed.

#### Scenario: Renaming
- **WHEN** a member saves a new name
- **THEN** the sidebar and the member list show the new name

#### Scenario: An empty name
- **WHEN** a member saves a name that is empty or only spaces
- **THEN** the refusal is shown beside the field and the old name is kept

#### Scenario: The address
- **WHEN** a member opens the Account panel
- **THEN** their email address is shown and cannot be edited

### Requirement: A platform admin has the same panels in the console

The admin console MUST offer the same Account, Two-factor authentication and Time zone
panels under its own settings, reached from the same menu, so that an admin who belongs
to no community can manage their account. Every load and action there MUST pass the
admin guard.

#### Scenario: An admin with no community
- **WHEN** an enrolled admin who belongs to no community chooses Preferences in the console
- **THEN** the console's Account panel opens

#### Scenario: A stranger posts to a console panel
- **WHEN** a request that is not from a listed admin posts to a console settings action
- **THEN** the answer is 404 and nothing changes

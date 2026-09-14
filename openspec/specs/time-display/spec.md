# time-display Specification

## Purpose
How moments are stored and which time zone a person sees them in: UTC in storage, the viewer's zone on screen, a community's zone for its calendar dates, a person's zone detected once and changeable, and the same text before and after a page hydrates.
## Requirements
### Requirement: Moments are stored in UTC and shown in the viewer's time zone

The application MUST store every moment as a UTC instant and MUST show it in the
time zone of the person viewing it: their own time zone when set, otherwise the
community's, otherwise UTC. A page rendered on the server and then in the browser
MUST show the same text for the same moment.

#### Scenario: Two members, one moment
- **WHEN** a decision recorded at 16:00 UTC is viewed by a member in Europe/Lisbon (summer) and one in America/New_York
- **THEN** the first sees 17:00 and the second sees 12:00

#### Scenario: No time zone set
- **WHEN** a member with no time zone views a community whose time zone is Europe/Berlin
- **THEN** times are shown in Berlin time

#### Scenario: Server and browser agree
- **WHEN** the server runs in UTC and the browser in Asia/Tokyo, and a page with times is loaded
- **THEN** the text shown before and after hydration is identical

#### Scenario: A public page
- **WHEN** an anonymous visitor opens a community's public page
- **THEN** its dates are shown in the community's time zone

### Requirement: A deadline names its time zone

A time a member must act before MUST be shown with the name of the time zone it is
shown in.

#### Scenario: A consent round's close
- **WHEN** a member in Europe/Lisbon views a round closing at 17:00 UTC in summer
- **THEN** it reads as closing at 18:00 with the zone's name beside it

### Requirement: A calendar date belongs to the community's time zone

A date without a time that a community sets MUST be stored as the start of that day
in the community's time zone and MUST be shown as that same date to every viewer,
whatever their time zone.

#### Scenario: A review date
- **WHEN** a steward in a Europe/Lisbon community sets a review date of 1 March
- **THEN** a member in America/Los_Angeles sees the review date as 1 March

#### Scenario: A date across a daylight-saving change
- **WHEN** the review date is the day the community's clocks change
- **THEN** it is stored as that day's local midnight and shown as that date

### Requirement: A person's time zone is detected once and can be changed

The application MUST set a signed-in person's time zone from their browser the first
time they load a page without one, MUST NOT change a time zone that is already set
without their action, and MUST let them choose another on their account page. A time
zone MUST be accepted only if the runtime recognises it.

#### Scenario: First visit
- **WHEN** a person with no time zone loads a page in a browser set to Europe/Lisbon
- **THEN** their time zone becomes Europe/Lisbon

#### Scenario: Travelling
- **WHEN** a person whose time zone is Europe/Lisbon loads a page from a browser set to Asia/Tokyo
- **THEN** their time zone stays Europe/Lisbon, and the account page offers to use Asia/Tokyo

#### Scenario: A made-up zone
- **WHEN** a request sets the time zone to "Mars/Olympus"
- **THEN** it is refused and the stored zone is unchanged

#### Scenario: Somebody else's time zone
- **WHEN** a request tries to set another person's time zone
- **THEN** only the requester's own account can be changed

### Requirement: Times are shown in the community's language

Dates and times MUST be formatted in the language the page is shown in, not a fixed
one.

#### Scenario: A German community
- **WHEN** a member views a decision date in a community whose language is German
- **THEN** the month is written in German


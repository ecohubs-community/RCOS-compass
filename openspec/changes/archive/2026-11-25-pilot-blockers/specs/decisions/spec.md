## MODIFIED Requirements

### Requirement: The freeze records a review date and who was present, from its own form

The freeze form MUST offer a review date and the list of who was present,
including each attendee's consent to be named, and MUST carry both to the
service that records the decision. The list MUST offer every current member of
the community. Where the selected version's round has responses, the people who
responded MUST be pre-selected and the review date and selection MUST remain
editable. The service MUST refuse an attendee who is not a current member of
the community, and record nothing.

#### Scenario: A review date is set
- **WHEN** a steward sets a review date and freezes
- **THEN** the decision records that date

#### Scenario: No review date is set
- **WHEN** a steward freezes without setting one
- **THEN** the decision records no review date, and this is not an error

#### Scenario: Attendees are pre-filled from the selected version's round
- **WHEN** a steward opens the freeze on v3, whose round has responses
- **THEN** the people who responded to v3 are offered as those present, already selected
- **AND** the steward can add, remove or change any of them before submitting

#### Scenario: Someone present did not answer
- **WHEN** a steward adds a current member who did not respond to the version as present and freezes
- **THEN** the decision counts that member as present

#### Scenario: The selected version has no round
- **WHEN** a steward opens the freeze on a version nobody responded to
- **THEN** nobody is pre-selected, every current member is offered, and the steward may record who was present

#### Scenario: An attendee is named without consent
- **WHEN** a steward records an attendee who did not consent to being named
- **THEN** the attendee is stored with consent withheld, and is still counted

#### Scenario: An attendee from elsewhere is refused
- **WHEN** a freeze is submitted naming as present a membership of another community, or one that has ended
- **THEN** the freeze is refused and no decision is recorded

#### Scenario: Somebody who has left is not offered
- **WHEN** a steward opens the freeze form after a member's membership has ended
- **THEN** that person is not offered as present

## ADDED Requirements

### Requirement: The freeze form opens where it can be read

Pressing the freeze control MUST open the freeze form as a sheet that fills the
height of the screen, with the act to record the decision always visible while
the form scrolls, at every width down to 375px. The sheet MUST take keyboard
focus, close on Escape and return focus to the control that opened it. Opening
the discussion with `?freeze=1` MUST open the form, and without JavaScript the
form MUST render in the page and still record the decision.

#### Scenario: A steward presses Freeze
- **WHEN** a steward presses "Freeze v2" on a discussion
- **THEN** a sheet titled "Freeze v2 into a decision" is visible, with "Record decision" on screen

#### Scenario: On a phone
- **WHEN** a steward presses "Freeze v2" at 375px wide and scrolls the form to its end
- **THEN** "Record decision" stays on screen throughout, and the page does not scroll sideways

#### Scenario: Closing it
- **WHEN** a steward presses Escape in the open sheet
- **THEN** the sheet closes, nothing is recorded, and focus is back on "Freeze v2"

#### Scenario: Opened from a link
- **WHEN** a steward opens the discussion with `?freeze=1`
- **THEN** the freeze form is open

#### Scenario: Without JavaScript
- **WHEN** a steward with JavaScript disabled opens the discussion with `?freeze=1` and submits the form
- **THEN** the decision is recorded

#### Scenario: A member sees no freeze
- **WHEN** a member opens the discussion, with or without `?freeze=1`
- **THEN** there is no freeze control and no freeze form

# accessibility Specification

## Purpose
Covers WCAG 2.1 AA as a property the suite holds rather than a pass somebody did: every route scanned or exempt with a stated reason, the product working at 375 pixels as well as at desktop widths, keyboard reachability with a visible focus indicator and focus moved to the heading on navigation, and contrast asserted against the design tokens where they are defined.
## Requirements
### Requirement: Every route is scanned, or listed as exempt with a reason

The suite MUST enumerate the application's routes and assert that each is either
covered by an automated accessibility scan or explicitly listed as exempt with a
stated reason. A route added later and left unscanned MUST fail the suite.

Scans MUST cover WCAG 2.1 A and AA.

#### Scenario: A route is added
- **WHEN** a new route is added and neither scanned nor listed
- **THEN** the suite fails and names the route

#### Scenario: A route is deliberately exempt
- **WHEN** a route is listed as exempt with a reason
- **THEN** the suite passes and the reason is readable in the list

#### Scenario: A violation is introduced
- **WHEN** a change introduces a WCAG AA violation on a scanned route
- **THEN** the scan fails and names the rule

### Requirement: The product works at 375 pixels, not only at tablet width

The core loop MUST run end to end at 375 pixels wide as well as at 1440, and the
accessibility scans MUST run at that width too. No page MUST scroll horizontally
at that width; content that cannot fit MUST scroll inside its own container.

#### Scenario: The loop at 375px
- **WHEN** the core-loop journey runs at 375 pixels
- **THEN** it completes

#### Scenario: A wide table
- **WHEN** a screen with a wide table is opened at 375 pixels
- **THEN** the table scrolls inside its own container and the page does not scroll sideways

### Requirement: The product is usable by keyboard alone

Every interactive element MUST be reachable by keyboard, MUST show a visible
focus indicator, and MUST NOT trap focus. After navigation, focus MUST move to
the new page's heading rather than staying where the previous page left it.

#### Scenario: A journey by keyboard
- **WHEN** the core loop is driven with the keyboard alone
- **THEN** every step can be completed

#### Scenario: Focus after navigating
- **WHEN** a link is followed
- **THEN** focus is on the new page's heading

#### Scenario: A dialog is opened and closed
- **WHEN** a panel or dialog is opened by keyboard and dismissed
- **THEN** focus returns to the control that opened it

#### Scenario: An element with no visible focus
- **WHEN** an interactive element renders no focus indicator
- **THEN** the keyboard test fails and names it

### Requirement: Contrast is a property of the tokens, checked where they are defined

Every foreground and background pair the design tokens define MUST meet WCAG AA
contrast at the size it is used, and a test MUST assert it against the token file
rather than against a rendered page.

#### Scenario: The tokens are checked
- **WHEN** the token test runs
- **THEN** every defined pair clears AA at its intended size

#### Scenario: A colour is darkened
- **WHEN** a token is changed to a value below the threshold
- **THEN** the test fails and names the pair and its ratio

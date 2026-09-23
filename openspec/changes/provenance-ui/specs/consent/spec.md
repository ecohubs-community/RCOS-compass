## ADDED Requirements

### Requirement: A steward sets when a round closes, and the discussion counts down to it

A steward SHALL be able to set or change the closing time of the consent round
on the current version, opening the round if it has not opened yet. A closing
time in the past MUST be refused. Setting or changing it MUST be recorded in the
thread with who did it. While the round is open with a closing time, the
discussion MUST show the closing time in the community's time zone and how long
remains. A member MUST NOT be permitted to set it.

#### Scenario: A steward sets a closing time
- **WHEN** a steward sets the round to close on 3 September at 20:00
- **THEN** the discussion shows "Closes 3 Sep, 20:00" and the days left
- **AND** a post in the thread says who set it

#### Scenario: The round had not opened
- **WHEN** a steward sets a closing time before anyone has responded
- **THEN** the round opens with the current eligibility and that closing time

#### Scenario: A time in the past
- **WHEN** a steward sets a closing time that has already passed
- **THEN** it is refused and the round is unchanged

#### Scenario: A member tries
- **WHEN** a member submits a closing time directly
- **THEN** it is refused

#### Scenario: Reminders follow
- **WHEN** a round with a closing time approaches it
- **THEN** members who have not answered are reminded, as the notifications spec requires

### Requirement: An objection shows who raised it and can be answered in place

Each open objection in a discussion SHALL show who raised it (or that the person
has been erased) and when, and MUST offer: a reply in the thread linked to the
objection's reason; an amendment, opening a new version of the proposal with the
objection referenced; and, to those holding the capability to resolve
objections, resolving it as addressed or overruled with a note. The note MUST be
required and MUST stay readable with the objection. The objector MUST be able to
withdraw their own objection from it. A member without the capability MUST NOT be
permitted to resolve someone else's objection.

#### Scenario: A steward resolves with a note
- **WHEN** a steward marks an objection addressed with the note "v3 adds the appeal step"
- **THEN** the objection is addressed, attributed to the steward, and the note is shown with it

#### Scenario: No note
- **WHEN** a steward resolves an objection without a note
- **THEN** it is refused and the objection stays open

#### Scenario: A member tries to resolve someone else's objection
- **WHEN** a member submits a resolution for another member's objection directly
- **THEN** it is refused

#### Scenario: The objector withdraws
- **WHEN** the member who objected withdraws from the objection itself
- **THEN** the objection is withdrawn and its reason stays readable

#### Scenario: Amending
- **WHEN** a member chooses to amend from an objection
- **THEN** the new-version form opens with the current version's text and the objection referenced in the revision note

#### Scenario: The objector was erased
- **WHEN** the objector's account has been erased
- **THEN** the objection shows the erased placeholder, not their name

### Requirement: A community may record an interim adoption rule, which informs and never enforces

A steward SHALL be able to record the community's interim adoption rule: a
quorum as a fraction of eligible members, and a minimum number of days a round
stays open, each optional. The rule MUST NOT prevent any response, closing or
freeze.

#### Scenario: A rule is recorded
- **WHEN** a steward records a quorum of three quarters and seven days
- **THEN** the rule is stored for the community

#### Scenario: A member tries to change it
- **WHEN** a member submits a rule directly
- **THEN** it is refused

#### Scenario: The rule does not gate
- **WHEN** a round has not reached the recorded quorum
- **THEN** a steward can still freeze the proposal

### Requirement: The discussion shows what it takes to pass, as facts against the community's own rule

While a round is open on the current version, the discussion SHALL show how many
eligible members have responded out of how many, how many objections are open,
and how many days the round has been open; and where the community has recorded
an interim rule, each fact beside what the rule asks for and whether it is met.
Where no rule is recorded it MUST say so and show the facts alone. The same
summary MUST be shown on the freeze form. The numbers MUST equal the round's
tally.

#### Scenario: Against a rule
- **WHEN** 15 of 19 eligible have responded, one objection is open, the round is 6 days old and the rule asks three quarters and seven days
- **THEN** presence reads met with 15 needed, objections reads one open, days reads 6 of 7 not yet met

#### Scenario: No rule recorded
- **WHEN** the community has recorded no interim rule
- **THEN** the facts are shown with a note that no rule is recorded, linking to settings

#### Scenario: Freezing with every line unmet
- **WHEN** a steward freezes while no line of the rule is met
- **THEN** the freeze succeeds and the freeze form had shown the unmet lines

#### Scenario: Counts match the tally
- **WHEN** a member changes their response
- **THEN** the responded count and the tally change together

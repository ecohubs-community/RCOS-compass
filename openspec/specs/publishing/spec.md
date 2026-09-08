# publishing Specification

## Purpose
Covers making a community's governance readable by the world: publishing and withdrawing as recorded governance acts, the community-level switch that turns the whole public presence on and off, 410 rather than 404 for something withdrawn, the binary compliance claim that never carries a percentage, attribution that cannot name somebody who did not consent, and the anonymous, read-only, crawlable surface those things are shown on.
## Requirements
### Requirement: Publishing to the world is a recorded decision

Setting an artifact's visibility to `world` MUST create a decision record naming
what was published and when. Publishing MUST NOT be a settings toggle.

#### Scenario: An artifact is published
- **WHEN** a steward publishes an artifact
- **THEN** a decision records the act, its actor and its time
- **AND** the artifact becomes readable without signing in

#### Scenario: A member tries to publish
- **WHEN** a member without permission to publish sets an artifact to `world`
- **THEN** it is refused and the artifact stays member-visible

#### Scenario: A community asks when it went public
- **WHEN** a member reads the register
- **THEN** the publishing decision is there with the rest

### Requirement: A community has a public presence before any page does

A community MUST have public routes only while its public index is switched on.
While it is off, every public URL MUST answer 404 regardless of what is
world-visible, so a community can withdraw its public presence without
unpublishing each artifact.

Switching it on MUST be a steward act and MUST be recorded.

#### Scenario: A community with world artifacts and the switch off
- **WHEN** an anonymous visitor requests any of its public URLs
- **THEN** every one answers 404

#### Scenario: A community turns the switch off again
- **WHEN** a steward switches the public index off
- **THEN** the public URLs stop answering and the artifacts keep their visibility

#### Scenario: A member turns it on
- **WHEN** a member without permission switches it on
- **THEN** it is refused and nothing becomes public

### Requirement: An unpublished page answers 410, not 404

A public URL whose subject has been unpublished MUST return **410 Gone**. It MUST
NOT return 404, and MUST NOT redirect.

Distinguishing the two MUST NOT depend on current visibility, which is identical
for a subject that was withdrawn and one that was never published. A subject MUST
record that it was published at least once, and that record MUST survive being
unpublished.

Unpublishing MUST itself write a decision record, for the same reason publishing
does: withdrawing something a community made public is a governance act, and a
community that can withdraw it silently has a gap in the record exactly where
somebody will later ask.

#### Scenario: An artifact is unpublished
- **WHEN** an anonymous visitor requests a URL that was public and no longer is
- **THEN** the response is 410 with a page saying the community withdrew it
- **AND** the register contains the decision that withdrew it

#### Scenario: A URL that never existed
- **WHEN** an anonymous visitor requests a URL for an artifact that was never published
- **THEN** the response is 404

#### Scenario: An artifact is published, withdrawn and published again
- **WHEN** it is public once more
- **THEN** the page is served, and both the publishing and the withdrawal are in the register

### Requirement: The public index carries the claim, never the number

The public surface MUST show compliance as yes or no with the list of what is
missing, and MUST NOT show a readiness percentage in any form. The view model the
public route renders MUST NOT contain one.

#### Scenario: A community is part-way through
- **WHEN** an anonymous visitor opens the public index of a community at 61% readiness
- **THEN** the page says it is not yet compliant and names the missing artifacts
- **AND** no percentage appears anywhere on it

#### Scenario: The percentage is added to the public view model
- **WHEN** a readiness figure is placed on any public route's data
- **THEN** the public-surface test fails

#### Scenario: A community's own text contains a percentage
- **WHEN** a published definition reads "a change requires 80% of members"
- **THEN** it is shown as written, and the surface is still considered free of a compliance percentage

#### Scenario: A compliant community
- **WHEN** every mandatory artifact is complete and nothing is provisional
- **THEN** the page states compliance with the standard's version and the date of the last self-audit

### Requirement: Publishing does not publish people

The public surface MUST attribute decisions by role and count unless an attendee
individually consented to being named. A community's `publish_names_policy` MUST
NOT be able to name someone who did not consent.

#### Scenario: A decision with attendees who did not consent
- **WHEN** a published decision had eleven people present and none consented to be named
- **THEN** the public page shows the mechanism and the tally, and no names

#### Scenario: One attendee consented
- **WHEN** one of eleven consented to be named
- **THEN** only that person's name appears

#### Scenario: A community sets its policy to names
- **WHEN** a community chooses to publish names
- **THEN** only attendees with individual consent are named, and the rest are still counted

### Requirement: The public index shows what a community added, and says it is theirs

Local definitions and community artifacts MUST appear on the public index and in
exports, and MUST be labelled as community additions rather than standard
requirements. They MUST NOT appear in the compliance count or the missing list.

#### Scenario: A community with its own artifact
- **WHEN** a community that has published a community artifact is read publicly
- **THEN** the artifact appears, labelled as not required by the standard

#### Scenario: Compliance accounting
- **WHEN** the binary claim is computed
- **THEN** community additions change neither the claim nor the list of what is missing

### Requirement: The public surface is anonymous, read-only and rate-limited

Public routes MUST work with no session, MUST NOT accept input from a visitor,
and MUST NOT reach any member-visible content. They MUST NOT construct a member
context in order to read.

Being the only surface reachable without a session, they MUST be rate-limited per
address, with a ceiling that does not throttle a search engine indexing a
community. Published communities MUST be crawlable and everything else MUST NOT
be: a public index nobody can find is not the distribution it exists to be.

#### Scenario: An anonymous visitor reads a published artifact
- **WHEN** they request it with no session
- **THEN** the artifact is served

#### Scenario: A crawl of every public route
- **WHEN** every public route of a community with both member-visible and world content is fetched anonymously
- **THEN** no member-visible text appears in any response

#### Scenario: A robots directive
- **WHEN** a crawler reads the site's robots file
- **THEN** the public group is allowed and every authenticated route is disallowed

#### Scenario: An anonymous client makes many requests
- **WHEN** requests from one address exceed the public ceiling
- **THEN** further requests are refused until the window passes

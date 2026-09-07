## ADDED Requirements

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

### Requirement: An unpublished page answers 410, not 404

A public URL whose subject has been unpublished MUST return **410 Gone**. It MUST
NOT return 404, and MUST NOT redirect.

#### Scenario: An artifact is unpublished
- **WHEN** an anonymous visitor requests a URL that was public and no longer is
- **THEN** the response is 410 with a page saying the community withdrew it

#### Scenario: A URL that never existed
- **WHEN** an anonymous visitor requests a URL for an artifact that was never published
- **THEN** the response is 404

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

### Requirement: The public surface is anonymous and read-only

Public routes MUST work with no session, MUST NOT accept input from a visitor,
and MUST NOT reach any member-visible content.

#### Scenario: An anonymous visitor reads a published artifact
- **WHEN** they request it with no session
- **THEN** the artifact is served

#### Scenario: A crawl of every public route
- **WHEN** every public route of a community with both member-visible and world content is fetched anonymously
- **THEN** no member-visible text appears in any response

## ADDED Requirements

### Requirement: Stewards are told when someone asks to join

Each current steward MUST receive one notification, and one mail unless they
have turned email off, when a join request's address is verified, or when a
verified account asks to join. The
notification and the mail MUST NOT carry the requester's name or address, and
the notification MUST lead to the Members page. Members who are not stewards MUST NOT be told.

#### Scenario: A request is proven
- **WHEN** a join request's address is verified in a community with two stewards and three members
- **THEN** the two stewards each have one notification and one mail, and the members have none

#### Scenario: What it carries
- **WHEN** a steward reads the notification and the mail
- **THEN** neither contains the requester's name or address, and the notification links to the Members page

#### Scenario: A steward who has left
- **WHEN** a former steward's membership has ended before a request is proven
- **THEN** the former steward is not told

### Requirement: A person let in is told

When a steward lets a requester in, the new member MUST receive a notification
and a mail that they can now open the community, with a link to it.

#### Scenario: Let in
- **WHEN** a steward lets a requester in
- **THEN** the new member has a notification and a mail with a link to the community's dashboard

#### Scenario: Declined
- **WHEN** a steward declines a requester
- **THEN** no notification is written for them, since they are not a member

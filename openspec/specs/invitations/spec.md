# invitations Specification

## Purpose
Governs how a person joins a community by invitation: single-use tokens bound to an address and stored hashed, atomic acceptance, and invitation mail that carries a link rather than community content.
## Requirements
### Requirement: An invitation is single-use and bound to its address

An invitation MUST be consumable exactly once, by the address it was sent to, and
MUST expire. Tokens MUST be stored hashed.

#### Scenario: An invitation is accepted
- **WHEN** the invited person follows a valid invitation and signs in with that address
- **THEN** a membership is created with the invited role
- **AND** the invitation is marked accepted

#### Scenario: The same invitation is used twice
- **WHEN** an already-accepted invitation is presented again
- **THEN** it is refused, and no second membership is created

#### Scenario: A different address accepts
- **WHEN** someone signed in with a different address presents the invitation
- **THEN** it is refused

#### Scenario: An expired invitation
- **WHEN** an invitation older than its expiry is presented
- **THEN** it is refused, and the refusal explains that it has expired

#### Scenario: The database is read directly
- **WHEN** the invitation table is inspected
- **THEN** the raw token does not appear in it

### Requirement: An invitation can be followed

The link in an invitation MUST lead to a page that says which community sent it
and which address it was sent to, and MUST offer a way in whether or not the
invited person already has an account. Loading that page MUST NOT consume the
invitation.

#### Scenario: The invited person has no account
- **WHEN** someone with no account follows a valid invitation
- **THEN** they can create one bound to the invited address
- **AND** the address is not a field the form lets them change

#### Scenario: The invited person has an account
- **WHEN** someone follows a valid invitation while signed out
- **THEN** they are offered sign-in, and return to the same invitation afterwards

#### Scenario: Somebody else is signed in
- **WHEN** a signed-in person whose address is not the invited one follows it
- **THEN** the page names both addresses and offers to sign out
- **AND** nothing is accepted, whatever they are a member of elsewhere

#### Scenario: The link is opened twice
- **WHEN** an invitation page is loaded more than once, or prefetched by a mail client
- **THEN** the invitation is still unaccepted and still usable

#### Scenario: A token that matches nothing
- **WHEN** a token that hashes to no stored invitation is followed
- **THEN** the page says the link does not work
- **AND** it does not answer 404, which would describe the address rather than the link

#### Scenario: The community does not work in English
- **WHEN** an invitation to a community whose locale is not the default is followed
- **THEN** the page is read in that community's language

### Requirement: An invitation is proof of the address

An account created by following an invitation MUST be treated as having a
verified email address, and the person MUST be signed in and taken to the
community without a second round of mail. The invitation was delivered to that
address, is single-use, and has just been presented — which is what a
verification mail exists to establish.

#### Scenario: An account is created from an invitation
- **WHEN** someone creates an account on the acceptance page
- **THEN** the address is verified, a membership exists, and they arrive in the community

#### Scenario: The address already has an account with no password
- **WHEN** someone whose address made an account through a join link, and never chose a password, accepts an invitation to it
- **THEN** the invitation's form gives that account its password, the address is verified, a membership exists, and they arrive in the community

#### Scenario: Sign-up has no other door
- **WHEN** someone with neither an invitation nor a community's join link looks for a way to create an account
- **THEN** the product offers none

### Requirement: Acceptance is atomic

Creating the membership and consuming the invitation MUST happen in one
transaction.

#### Scenario: Two acceptances race
- **WHEN** the same invitation is accepted twice concurrently
- **THEN** exactly one membership exists afterwards

#### Scenario: Membership creation fails
- **WHEN** the membership cannot be created
- **THEN** the invitation remains unaccepted and can be retried

### Requirement: Invitation mail carries a link, not content

Mail sent by the application MUST NOT contain community content.

#### Scenario: An invitation is sent
- **WHEN** an invitation email is generated
- **THEN** it contains the community name and a link
- **AND** it contains no definition, discussion, or decision text

### Requirement: A steward invites people from the member list

A steward MUST be able to invite up to 50 addresses at once from the Members
page, with one role for the batch. Each address MUST get its own outcome, and a
problem with one address MUST NOT stop the others. A member MUST NOT be able to
invite. Invitations MUST be limited per steward per day. When the mail for an
invitation cannot be sent, the steward MUST be told for that address and offered
a resend; the invitation link MUST NOT be shown.

#### Scenario: A steward invites a list
- **WHEN** a steward pastes three addresses separated by commas and new lines and sends them as members
- **THEN** each address has a pending invitation with the member role and an invitation mail
- **AND** the page lists each address as sent

#### Scenario: Some addresses cannot be invited
- **WHEN** a steward's list holds a current member's address, a word that is not an address, and a new address
- **THEN** the new address is invited, and the other two are reported as "already a member" and "not an address"

#### Scenario: The same address twice
- **WHEN** a list holds the same address twice, in different case
- **THEN** one invitation is sent

#### Scenario: More than 50 addresses
- **WHEN** a steward submits 51 addresses
- **THEN** nothing is sent and the page says the limit is 50

#### Scenario: The daily limit is reached
- **WHEN** a steward has sent 100 invitations in the last 24 hours and sends more
- **THEN** those addresses are reported as over the limit and no invitation is created for them

#### Scenario: Current members cost nothing
- **WHEN** a steward pastes the addresses of current members many times in a day
- **THEN** each is reported as already a member, and the daily limit is not spent on them

#### Scenario: The mail fails
- **WHEN** an invitation is created but its mail cannot be sent
- **THEN** that address is reported as not sent, with a resend offered
- **AND** no invitation link appears on the page

#### Scenario: A member tries to invite
- **WHEN** a member posts to the invite action
- **THEN** it is refused and no invitation is created

### Requirement: Stewards see pending invitations, and can resend or withdraw them

The Members page MUST list, to stewards only, every invitation that has been
neither accepted nor withdrawn, with its address, role, the date it was sent and
whether it has expired. A steward MUST be able to resend one — which replaces it
with a new invitation and a new mail — or withdraw it. A member MUST NOT see the
list.

#### Scenario: A steward reads the list
- **WHEN** a steward opens the Members page with one waiting and one expired invitation
- **THEN** both are listed, the expired one marked as expired

#### Scenario: A steward resends an expired invitation
- **WHEN** a steward resends an expired invitation
- **THEN** a new invitation with a new expiry is mailed, and the old link no longer works

#### Scenario: The owner's invitation is resent
- **WHEN** a steward resends an invitation that carries the owner flag
- **THEN** the new invitation carries it too

#### Scenario: A steward withdraws an invitation
- **WHEN** a steward withdraws an invitation and the invited person then follows it
- **THEN** it is no longer listed, and the link says it has already been used

#### Scenario: A member reads the Members page
- **WHEN** a member opens the Members page
- **THEN** no invitation is listed

#### Scenario: Another community's invitation
- **WHEN** a steward resends or withdraws an invitation that belongs to another community
- **THEN** the answer is 404 and it is unchanged


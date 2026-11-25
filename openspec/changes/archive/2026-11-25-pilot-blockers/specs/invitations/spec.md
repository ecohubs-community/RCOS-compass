## ADDED Requirements

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

## MODIFIED Requirements

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

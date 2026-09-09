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

#### Scenario: Sign-up has no other door
- **WHEN** someone without an invitation looks for a way to create an account
- **THEN** the product offers none: the instance is invitation-only

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

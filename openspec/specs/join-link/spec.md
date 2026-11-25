# join-link Specification

## Purpose
TBD - created by archiving change pilot-blockers. Update Purpose after archive.
## Requirements
### Requirement: A steward can turn a community's join link on, replace it and turn it off

A community MUST have at most one join link, and none until a steward turns it
on. Only a steward MUST be able to turn it on, read it, replace it or turn it
off. Replacing it MUST make the previous link stop working at once. The link's
token MUST NOT be stored in a form that can be followed as it stands.

#### Scenario: A new community has no link
- **WHEN** a steward opens the Members page of a community nobody has set a link for
- **THEN** there is no link to copy, and an offer to turn one on

#### Scenario: A steward turns the link on and copies it
- **WHEN** a steward turns the join link on
- **THEN** a link to `/join/<token>` is shown, and the same link is shown again on a later visit

#### Scenario: A steward replaces the link
- **WHEN** a steward replaces the join link and someone then follows the old one
- **THEN** the old link says it no longer works, and the new one works

#### Scenario: Replacing clears the unproven queue
- **WHEN** a steward replaces or turns off the link while two requests are unverified and one is verified
- **THEN** the two unverified requests are gone and the verified one is still listed

#### Scenario: A steward turns the link off
- **WHEN** a steward turns the join link off and someone then follows it
- **THEN** the link says it no longer works, and no account or request is created

#### Scenario: A member cannot see or change the link
- **WHEN** a member opens the Members page, or posts to the join-link actions
- **THEN** no link is shown and the actions are refused

#### Scenario: Another community's steward
- **WHEN** a steward of one community posts a join-link action naming another community
- **THEN** the answer is 404

#### Scenario: The database is read directly
- **WHEN** the join-link table is inspected
- **THEN** the raw token does not appear in it

### Requirement: Following a join link makes a request, never a membership

Following a working join link MUST create at most a join request. It MUST NOT
create a membership or show any community content. A person without an account
MUST be able to create one through the link; that account MUST NOT be verified
by the link, and the form MUST NOT take a password: the account's first password
MUST be chosen only by the person its verification mail signed in. The page
MUST answer the same way whether or not the address it is given already has an
account.

#### Scenario: Someone without an account follows the link
- **WHEN** a signed-out person submits a name and an address on a working join link
- **THEN** an unverified account with no password and a join request exist, a verification mail is sent, and the page says to check their inbox
- **AND** no membership exists and no steward has been told

#### Scenario: Somebody else's address is typed in
- **WHEN** someone submits another person's address on the join link, and that person later follows the verification mail
- **THEN** the person who submitted it knows no password for the account, and the owner of the address chooses it after verifying

#### Scenario: The address already has a verified account
- **WHEN** a signed-out person submits an address that already has a verified account
- **THEN** the page says to check their inbox, as for a new address
- **AND** a sign-in link is mailed to that address, and no request or account is created

#### Scenario: The address has an account that was never verified
- **WHEN** a signed-out person submits an address whose account is not verified
- **THEN** the page says to check their inbox, a fresh verification mail is sent, and the address has one join request

#### Scenario: A signed-in person asks to join
- **WHEN** a signed-in person who is not a member presses "Ask to join"
- **THEN** a join request exists and the community's stewards are told

#### Scenario: A member follows the link
- **WHEN** a signed-in member of the community follows its join link
- **THEN** they are taken to the community and no request is created

#### Scenario: Someone waiting follows the link again
- **WHEN** a signed-in person whose request is still open follows the link
- **THEN** the page says a steward will let them in, and there is still one request

#### Scenario: Let in before choosing a password
- **WHEN** a person who closed the password step is let in and opens the community on the session their verification mail started
- **THEN** they are sent to choose a password first, and then to the community

#### Scenario: Verification lands on the password step, then the waiting page
- **WHEN** a person follows their verification mail, even after the link they used was replaced
- **THEN** they are signed in and asked to choose a password, and then shown that a steward of that community will let them in, and nothing of the community's content

#### Scenario: A link that does not work
- **WHEN** a link that was turned off, replaced, or never existed, or whose community is suspended or deleted, is followed
- **THEN** the page says the link does not work any more and offers nothing to submit
- **AND** it does not answer 404

### Requirement: Stewards hear about a request only once its address is proven

A join request MUST NOT be shown to stewards, and stewards MUST NOT be told of
it, until the requester's address is verified. When it is verified, the
community's current stewards MUST be told exactly once.

#### Scenario: The address is verified
- **WHEN** the person follows the verification mail sent after they used the join link
- **THEN** each steward of that community has one notification and one mail saying someone asked to join
- **AND** the request is listed on the Members page for stewards

#### Scenario: Verification is followed twice
- **WHEN** the same address is verified again
- **THEN** no steward is told a second time

#### Scenario: Never verified
- **WHEN** an address that used the join link is never verified
- **THEN** stewards are never told, the request is not listed, and after seven days the request is deleted and the account, if nothing else holds it, is erased

### Requirement: Join links are limited

Join-link submissions MUST count against the per-client-address sign-in attempt
limit, and a community MUST NOT hold more than 50 open join requests. A refused attempt MUST create nothing and
MUST say plainly why.

#### Scenario: Too many attempts from one address
- **WHEN** join-link submissions from one client address exceed the sign-in attempt limit within its window
- **THEN** the next is refused as too many requests, and no account or request is created

#### Scenario: The community's queue is full
- **WHEN** a community already has 50 open join requests and someone submits the form
- **THEN** it is refused with a plain message to ask a steward, and nothing is created

### Requirement: A steward lets a requester in or declines them

Only a steward MUST be able to decide a join request. Letting someone in MUST
create their membership with the member role and remove the request in one
transaction; the person MUST then be told, in the app and by mail. Declining
MUST remove the request and mail the person that it was not accepted. An
account declined that has never belonged to any community MUST be erased, which
frees its address.

#### Scenario: A steward lets someone in
- **WHEN** a steward lets a verified requester in
- **THEN** the person is a member with the member role and the next membership number, the request is gone, and they receive a notification and a mail
- **AND** the audit trail records that they joined through the join link

#### Scenario: A steward declines a newcomer
- **WHEN** a steward declines a requester whose account has never belonged to any community
- **THEN** the request is gone, the person is mailed that it was not accepted, and their account is erased

#### Scenario: A steward declines someone who belongs elsewhere
- **WHEN** a steward declines a requester who is a member of another community
- **THEN** the request is gone and the person is mailed, and their account is untouched

#### Scenario: A steward declines someone invited elsewhere
- **WHEN** a steward declines a requester who holds an open invitation from another community
- **THEN** the account is not erased, and that invitation still works

#### Scenario: A member tries to decide
- **WHEN** a member posts a decision on a join request
- **THEN** it is refused and the request is unchanged

#### Scenario: A steward of another community
- **WHEN** a steward posts a decision naming a request of another community
- **THEN** the answer is 404 and the request is unchanged

#### Scenario: The request was already decided
- **WHEN** a second steward decides a request that has just been decided
- **THEN** the answer says it is already decided, and no second membership or mail is created


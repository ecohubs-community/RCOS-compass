# notifications Specification

## Purpose
Covers telling a member what happened where they can act on it: notification rows are written inside the transaction that caused them, mail is left to a job, a person whose membership has ended is told nothing, and the weekly digest carries counts and a link rather than content.
## Requirements
### Requirement: Notifications are written with the act that caused them

Notification rows MUST be written inside the transaction that caused them, and
sending mail MUST NOT happen during that transaction.

#### Scenario: A decision is frozen
- **WHEN** the freeze transaction commits
- **THEN** every recipient's notification exists
- **AND** no mail was sent during it

#### Scenario: The transaction rolls back
- **WHEN** a freeze fails
- **THEN** no notification about it exists

### Requirement: A member is told what happened where they can act on it

The application MUST record a notification for each recipient of an event that
concerns them — a proposal or reply in a discussion they joined, a mention, a
consent round opened or closing, a decision frozen, a review date reached, a
discussion they opened gone quiet, a change to their role, a withdrawn compliance
claim for stewards — and MUST show them in the application, in the bell and on the
notifications page.

#### Scenario: A proposal is posted
- **WHEN** a member posts a proposal in a discussion others have joined
- **THEN** each of those members has a notification

#### Scenario: The author of the event
- **WHEN** a member performs the action themselves
- **THEN** they receive no notification for their own act

#### Scenario: Notifications are per community
- **WHEN** a member belongs to two communities
- **THEN** each notification names the community it came from, and none crosses between them

#### Scenario: Shown in the application
- **WHEN** a notification is written for a member
- **THEN** it appears in that member's bell and on their notifications page for that community

### Requirement: A member who has left is told nothing

Notifications MUST NOT be created for a person whose membership has ended, and
existing ones MUST NOT be readable after a membership ends. The one exception is
the removal itself: a member whose membership is ended by a steward MUST be told by
email, carrying the community's name and nothing about who removed them or why, and
no notification row is written for it.

#### Scenario: A member is removed
- **WHEN** a member's membership ends and an event then occurs
- **THEN** they receive no notification

#### Scenario: A former member requests their list
- **WHEN** they request notifications for that community
- **THEN** the answer is the same as for a community that does not exist

#### Scenario: The removal is told by email
- **WHEN** a steward removes a member
- **THEN** that person receives one email saying they are no longer a member of the named community, and no notification row exists for it

#### Scenario: Erasing their own account
- **WHEN** a person erases their account and their memberships end with it
- **THEN** no removal email is sent

### Requirement: The weekly digest carries a link and no content

The digest MUST be sent by a job rather than during a request, once a week per
member on the morning of the day that member chose in their own time zone, and
never to a member who has turned email off. It MUST summarise counts and titles only — the community's activity and that
member's unread notifications by kind — and MUST contain no definition text,
discussion text, or decision rationale.

#### Scenario: A digest is sent
- **WHEN** the digest job runs on a member's chosen day for a community with activity
- **THEN** that member is sent one message carrying counts and a link

#### Scenario: The body is inspected
- **WHEN** a digest body is searched for definition or discussion text
- **THEN** none appears

#### Scenario: A week with nothing in it
- **WHEN** the job runs for a member with no community activity and no unread notifications
- **THEN** no message is sent

#### Scenario: Freezing sends no mail
- **WHEN** a decision is frozen
- **THEN** its notification rows are written in the same transaction
- **AND** no message is sent, because mail is the digest's work and nothing that
  slow may hold the write lock a freeze holds

#### Scenario: Not the chosen day
- **WHEN** the job runs on a Monday for a member who chose Thursday
- **THEN** that member is not sent a digest

#### Scenario: Two time zones
- **WHEN** it is Monday morning in Lisbon and still Sunday in Honolulu, and two members chose Monday
- **THEN** the member in Lisbon is sent a digest and the member in Honolulu is not yet

#### Scenario: The job runs twice on the day
- **WHEN** the digest job runs a second time on a member's chosen day
- **THEN** no second digest is sent

#### Scenario: Email off
- **WHEN** a member has turned email off
- **THEN** no digest is sent to them, whatever the activity

### Requirement: A member is told when a job they started has finished

A member MUST receive an in-app notification when a background job they started
reaches its end — an export ready, a document scan complete or stopped — even
though their own act started it. The notification MUST be
written in the transaction that records the job's outcome, and MUST NOT be written
for a member whose membership has ended.

#### Scenario: An export is ready
- **WHEN** the export a member requested is built
- **THEN** that member has an `export.ready` notification

#### Scenario: A scan completes
- **WHEN** the scan a member started completes
- **THEN** that member has a notification naming the document and how many passages await review

#### Scenario: A scan stops on a budget
- **WHEN** the scan a member started stops because their budget ran out
- **THEN** that member has a notification naming the document and the reason

#### Scenario: Other members
- **WHEN** a scan started by one member completes
- **THEN** no other member receives a notification about it

#### Scenario: The member left before the scan ended
- **WHEN** a scan ends after the member who started it left the community
- **THEN** no notification is written

### Requirement: A bell shows how many notifications are unread and the latest of them

Every screen of a community MUST show a bell with the member's unread count for
that community, labelled with the count in words. Activating it MUST show the
latest notifications with a way to mark all as read and a link to the full list.
Without JavaScript the bell MUST be a link to the full list. The unread count MUST
NOT be shown on any other navigation item.

#### Scenario: Unread notifications
- **WHEN** a member with three unread notifications opens any community screen
- **THEN** the bell reads "Notifications, 3 unread" and shows a count of 3

#### Scenario: Opening the bell
- **WHEN** the member activates the bell
- **THEN** the latest notifications are listed, newest first, with *Mark all as read* and *See all*

#### Scenario: Without JavaScript
- **WHEN** a member without JavaScript activates the bell
- **THEN** the notifications page opens

#### Scenario: Another community's notifications
- **WHEN** a member of two communities has unread notifications only in the other one
- **THEN** this community's bell shows no unread count

### Requirement: A member can read their notifications on a page

Each community MUST have a notifications page listing the member's latest 200
notifications, newest first, distinguishing unread from read by more than colour.
The unread count MUST count every unread notification, not only those listed.

#### Scenario: The list
- **WHEN** a member opens the notifications page
- **THEN** their notifications for this community are listed newest first, unread ones marked in text as well as style

#### Scenario: More than 200
- **WHEN** a member has 250 unread notifications
- **THEN** the page lists 200 and the bell counts 250

#### Scenario: Somebody else's notifications
- **WHEN** a member requests the page
- **THEN** no notification addressed to another member appears

### Requirement: Opening a notification marks it read

Opening a notification MUST mark it read and take the member to what it is about.
Marking read MUST happen only through a form submission, never through following a
link, so that preloading cannot mark a notification read. A member MUST be able to
mark all their notifications in the community read at once. Marking read MUST
remain possible in a suspended community.

#### Scenario: Opening one
- **WHEN** a member opens an unread notification about a discussion
- **THEN** it is marked read and the discussion is shown

#### Scenario: Preloading a link
- **WHEN** a browser preloads the notifications page or hovers an item
- **THEN** no notification is marked read

#### Scenario: Mark all as read
- **WHEN** a member chooses *Mark all as read*
- **THEN** every unread notification of theirs in this community is read and the count is zero

#### Scenario: Another member's notification
- **WHEN** a member submits the id of a notification addressed to someone else
- **THEN** the answer is the same as for a notification that does not exist, and nothing is marked

### Requirement: A notification whose subject is gone says so

The application MUST mark read, and MUST say is no longer available instead of
showing an error page, a notification whose subject was deleted or is no longer
visible to the member opening it.

#### Scenario: A removed document
- **WHEN** a member opens a scan notification for a document a steward has since removed
- **THEN** the notifications page says the document is no longer available

#### Scenario: A subject made restricted
- **WHEN** a member opens a notification about a decision now restricted from them
- **THEN** they are told it is no longer available, and nothing about the decision is shown

### Requirement: Notifications read in the community's language and leak nothing restricted

A notification MUST be shown in the community's current interface language, built
from its kind and stored values at the time it is shown. Stored values MUST NOT
include a person's name or email; a person MUST be stored as a membership and shown
through the person label. A notification whose subject is gone or not visible to
the member MUST be shown without its title or any other stored value.

#### Scenario: The community changes language
- **WHEN** a community switches from English to German after a notification was written
- **THEN** the notification reads in German

#### Scenario: An erased actor
- **WHEN** the member who mentioned someone is later erased
- **THEN** the notification names them as a former member with their number

#### Scenario: A notification written before this change
- **WHEN** a member opens a notification that has no stored values
- **THEN** its stored summary is shown

#### Scenario: A decision restricted after it was announced
- **WHEN** a decision a member was told about becomes restricted from them
- **THEN** their list shows that notification as no longer available, without the decision's title

### Requirement: Replies in a thread you are in are collapsed

A reply in a discussion MUST notify the discussion's participants other than its
author. While a participant has an unread reply notification for that discussion,
further replies MUST update it with a count instead of adding notifications.

#### Scenario: Three replies
- **WHEN** three replies are posted in a thread while a participant has not opened its notification
- **THEN** that participant has one notification reading three new replies

#### Scenario: After reading
- **WHEN** the participant opens the notification and a fourth reply is posted
- **THEN** a new notification is written for the fourth reply

#### Scenario: Not a participant
- **WHEN** a reply is posted in a thread a member never wrote in or opened
- **THEN** that member receives nothing

### Requirement: A member is told when they are mentioned

A post that mentions a current member of the community MUST notify that member,
unless they wrote the post. A mention MUST NOT be collapsed with other
notifications. A mentioned member who is also a participant MUST receive the
mention instead of a reply notification for that post.

#### Scenario: A mention
- **WHEN** Ana posts a reply mentioning Lena
- **THEN** Lena has a mention notification naming Ana and the discussion

#### Scenario: A number from elsewhere
- **WHEN** a post mentions a membership number that is not a current member of this community
- **THEN** no notification is written, in this community or any other

#### Scenario: Mentioning yourself
- **WHEN** a member mentions themselves
- **THEN** they receive nothing

### Requirement: A consent round about to close reminds those who have not answered

Each eligible member who has not responded MUST be notified once, in the
application and by email, when an open consent round has a closing time within 48
hours.

#### Scenario: Closing tomorrow
- **WHEN** a round closes in 30 hours and Lena is eligible and has not responded
- **THEN** Lena has one closing reminder and one email

#### Scenario: Already answered
- **WHEN** Marco has responded to that round
- **THEN** Marco receives no reminder

#### Scenario: Checked again
- **WHEN** the reminder check runs a second time before the round closes
- **THEN** no second reminder is written

#### Scenario: No closing time
- **WHEN** an open round has no closing time
- **THEN** nobody is reminded

### Requirement: A discussion you opened that has gone quiet is mentioned

The member who opened a discussion MUST be notified once for each quiet spell,
when the open discussion has had no activity for 14 days.

#### Scenario: Quiet for two weeks
- **WHEN** a discussion Ana opened has had no activity for 15 days
- **THEN** Ana has one notification that it has gone quiet

#### Scenario: It wakes and sleeps again
- **WHEN** someone replies after that notification and the thread is then quiet for another 14 days
- **THEN** Ana is notified again

#### Scenario: A closed discussion
- **WHEN** a discussion is no longer open
- **THEN** its opener is not told it is quiet

### Requirement: An author is told when their definition is past its review date

The member who authored a definition's adopted version MUST be notified once when
the definition's review date has passed, or the member who created the definition
when the author is unknown.

#### Scenario: Past review
- **WHEN** a definition Lena authored passed its review date yesterday
- **THEN** Lena has one review-due notification naming the definition

#### Scenario: The author left
- **WHEN** the author's membership has ended
- **THEN** nobody is notified

### Requirement: A member is told when their role changes

When a steward changes a member's role, that member MUST be notified in the
application and by email.

#### Scenario: Made a steward
- **WHEN** Ana makes Lena a steward
- **THEN** Lena has a notification that her role is now steward, and an email

#### Scenario: The steward themselves
- **WHEN** the role change completes
- **THEN** Ana, who made it, receives nothing

### Requirement: Stewards are told when the compliance claim is withdrawn

Stewards MUST be notified, in the application and by email, when their community's
outward compliance claim changes from compliant to not compliant. Members who are
not stewards MUST NOT be notified. The first check of a community MUST record its
claim without notifying anyone.

#### Scenario: A freeze withdraws the claim
- **WHEN** a freeze leaves a compliant community not compliant
- **THEN** within a minute every steward has a claim-withdrawn notification and an email

#### Scenario: Something else withdraws the claim
- **WHEN** a compliant community becomes not compliant without a freeze
- **THEN** within the hour every steward is notified

#### Scenario: A member
- **WHEN** the claim is withdrawn
- **THEN** a member who is not a steward receives nothing

#### Scenario: Never compliant
- **WHEN** a community that was never compliant is checked
- **THEN** nobody is notified

### Requirement: Events that need attention now are emailed after the act commits

The application MUST send email for a consent round opening or closing, a role
change, a removal and a withdrawn compliance claim from a background job after the
act's transaction commits. It MUST carry a subject line, a sentence naming the kind of
event and the community, a link into the application, and a link to email
preferences — and MUST NOT carry discussion, proposal, definition or decision text.
It MUST NOT be sent to a member who has turned email off.

#### Scenario: A role change
- **WHEN** a member's role is changed
- **THEN** an email is sent after the change commits, naming the community and linking to it, with no other content

#### Scenario: Email off
- **WHEN** a member who turned email off becomes eligible for a closing consent round
- **THEN** they have the in-app reminder and no email

#### Scenario: The send fails
- **WHEN** the mail server refuses the message
- **THEN** the role change stands, and the failure is recorded for the status page

#### Scenario: Opening from an email
- **WHEN** a member follows the link in an email
- **THEN** they reach the subject, and the notification is not marked read by following it

### Requirement: Only current members of the community receive notifications

Writing a notification MUST deliver only to current members of the community the
act happened in, whatever recipients the caller named.

#### Scenario: A recipient from another community
- **WHEN** an event names a membership that belongs to another community
- **THEN** no notification is written for it

#### Scenario: A recipient who has left
- **WHEN** an event names a membership that has ended
- **THEN** no notification is written for it


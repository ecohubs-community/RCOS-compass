## Why

Compass writes notifications and never shows them. A member sees an unread count
on *Discussions* that only ever rises, because nothing marks anything read. They
can't tell whether it means a proposal, a finished scan or an export. Half of what
UI spec §4.11 says the app may interrupt a member about is never written at all.
The `notifications` spec already requires notifications to be shown in the
application, so the product is out of step with its own contract.

What a community loses without this: the moments that need a person — a consent
round about to close, a reply in their thread, a definition due for review — pass
unnoticed. A governance tool that nobody is told about gets forgotten. The email
promise ("every member controls their own digest day and can turn email off") is
not kept either: today everyone gets the same weekly digest, with no way to stop
it.

Reasoning: `UI Spec — v0.1 (draft).md` §4.11 (what may interrupt, email carries a
link never content) and §1.6; `docs/01-server-client-contract.md` (loads, form
actions, no JSON endpoints); `docs/04-security.md` §5 and §7; `docs/03-data-model.md`
§10 (erasure and person labels); `design_files/platform/TopBar.dc.html` (the bell).

## What Changes

- **A bell in the TopBar** with the unread count, opening a dropdown of the latest
  notifications with *See all* and *Mark all as read*. Without JavaScript the bell
  is a link to the page. The unread badge moves off the *Discussions* nav item.
- **A notifications page** per community, `/c/[slug]/notifications`, listing the
  latest 200 with read and unread distinguished by more than colour.
- **Marking read.** Opening a notification is a form post that marks it read, then
  goes to what it is about. It is never a GET, so link prefetching can't read a
  member's notifications. There is *Mark all as read*. A notification whose subject
  has been deleted, or is no longer visible to the member, says it is no longer
  available instead of sending them to a 404.
- **Text in the community's language.** New notifications store their kind and a
  few values, not an English sentence, and render through paraglide messages. A
  community that changes its language reads its old notifications in the new one.
  Existing rows keep their stored summary.
- **Nothing restricted leaks.** A notification about something since removed or
  restricted shows only "No longer available", without its title.
- **The missing §4.11 events:**
  - a reply in a thread you are in, collapsed to one unread notification per
    thread;
  - a mention of you in a post;
  - a consent round you are eligible for closing within 48 hours;
  - a discussion you opened quiet for 14 days;
  - a definition you authored past its review date;
  - your role changed;
  - you were removed from the community (email only — see Impact);
  - the community's compliance claim withdrawn (stewards).
- **Mentions.** A post can mention a member. The composer suggests members, and
  the stored token names the membership, not a person's name. It renders through
  `personLabel`, so an erased member reads as a former member.
- **Immediate email** for the events §4.11 marks *immediately*: consent opened,
  consent closing, role changed, removed, and compliance withdrawn. It is sent by a
  job after the act commits, and carries a subject line and a link, never content.
- **One gate for recipients.** `notify` itself drops anyone who is not a current
  member of the community, instead of every caller remembering to.
- **Email preferences** per membership, at `/c/[slug]/notifications/settings`:
  - turn email off entirely;
  - choose the digest day.
  - In-app notifications can't be turned off.
  - Every email links to these preferences.
- **The digest becomes per member.** It is sent on each member's chosen day in
  their own time zone, never twice in a week. It counts that member's unread notifications by kind
  alongside the community's activity, and still carries counts, titles and a
  link, never content.
- **No clean-up job.** The page shows the latest 200, as `listNotifications`
  already does. The unread count is still counted in full.

## Capabilities

### New Capabilities

- `notification-preferences`: a member's email choices per community (email off,
  digest day), where they are changed, and that every email links to them.

### Modified Capabilities

- `notifications`:
  - notifications are shown in a bell and on a page;
  - they are marked read;
  - they render in the community's current language, and restricted subjects
    leak nothing;
  - gone subjects say so;
  - the §4.11 events are written, with replies collapsed per thread;
  - immediate emails for the events that need one;
  - the digest is per member, on their day, respecting email off;
  - a removal is told by email even though the membership has ended.
- `discussions`: a post can mention a member, and the mention survives erasure as
  a person label.

## Impact

- **Depends on `local-time`:** a person's time zone and the shared date formatter.
  That change lands first.

- **Schema:**
  - `notification` gains `params` (JSON, nullable), which also carries the count
    of collapsed replies;
  - `membership` gains `email_enabled`, `digest_day` and `last_digest_at`;
  - `community` gains `claim_compliant` (last known outward claim) for detecting a
    withdrawal.
  - One migration, with rows in `docs/13-data-inventory.md`.
- **Server:**
  - `services/notifications.ts`: kinds, params, collapsing, `openNotification`,
    `markAllRead`, a subject resolver;
  - new emitters in `discussions`, `members` and `consent-round`;
  - an hourly `notification-sweep` job for consent closing, quiet threads and
    review dates;
  - a `claim-check` job, enqueued by the sweep and by a freeze;
  - a `notification-mail` job for immediate email;
  - the digest job reworked to run hourly and send per member in their time zone;
  - `markRead(ids)` removed in favour of `open` and `readAll`.
- **Mentions:** a new inline node in the markdown allowlist (`$lib/shared/markdown`,
  `$lib/server/markdown`, `InlineText`), and a member suggestion list in the post
  composer.
- **Client:**
  - `TopBar` gains the bell (Bits UI popover);
  - `+layout.server.ts` loads the unread count and the latest few;
  - new `notifications` and `notifications/settings` routes;
  - the *Discussions* badge is removed.
- **Erasure:**
  - mention tokens and actor references in `params` are membership ids rendered
    through `personLabel`;
  - the modules listed in `tests/support/person-surfaces.ts`.
- **A deliberate departure from `notifications`:** "A member who has left is told
  nothing" gains one exception — the removal itself, by email, since the removed
  person can no longer open the app.
- **Out of scope:**
  - push, SMS and browser notifications;
  - one-click unsubscribe headers (RFC 8058);
  - per-event email toggles beyond "email off";
  - a notification clean-up job;
  - real-time delivery (the count updates on the next load).

## Context

What exists (`src/lib/server/services/notifications.ts`,
`src/lib/server/db/schema/notifications.ts`):

- **`notify(db, ctx, input)`** writes one row per recipient id it is given. It skips
  the actor unless `includeActor`, and trusts the ids: it does not itself drop ended
  or foreign memberships. A row has `kind`, `subject_type`, `subject_id`, an English
  `summary` and `read_at`.
- **Kinds written today:**
  - `proposal.posted` (to discussion participants; written just *after* the
    proposal transaction);
  - `consent.opened` (to eligible members, inside the round transaction);
  - `decision.frozen` (inside the freeze);
  - `export.ready` and `document.scan_ended` (to the member a job ran for).
  - `definition.review_due` is declared, but nothing writes it.
- **`listNotifications`** (latest 200), **`unreadCount`** and **`markRead(ids)`**
  exist. `unreadCount` is loaded by the community layout and shown as a badge on
  the *Discussions* nav item. **Nothing calls `markRead`**, so the badge only rises.
- **Language is the community's.** `src/lib/server/locale.ts` answers every request
  in the community's locale; there is no per-person interface language. A stored
  English `summary` is therefore wrong for every non-English community, and stays
  wrong after a community changes its locale.
- **Time zones.** Timestamps are stored as UTC epoch milliseconds. `community` has
  a `timezone` (IANA, default `UTC`), used for decision reference years and AI
  budget days. Display is ad hoc: about twenty call sites format with
  `toLocaleDateString('en-GB')`, which uses the server's zone during SSR and the
  browser's after hydration. The companion change **`local-time`** gives every
  person a time zone and one formatter; this change depends on it.
- **The digest** (`jobs/digest.ts`) runs every seven days for every active
  community and mails every member the same body. There is no per-member choice.
- **Mail** goes through `getMailTransport()`, which records failures for the status
  page. Invitations and auth mail are sent in the request.
- **Visibility.** Decisions and definitions carry `visibility` and can become
  restricted after a notification about them was written. Discussions don't.
- **Review dates** live on `definition.review_due_at` (and on decisions). The
  author of a definition's text is the adopted version's `author_id`; the
  definition's `created_by` is who opened it.
- **The TopBar** left out the design's bell until a screen existed. `HelpTip`
  already uses the Bits UI `Popover`; `ClausePicker` shows the link-then-enhance
  pattern.
- **Membership** has `seq` (`M-0142`), `display_name` and `ended_at`. People render
  through `personLabel`, and `tests/support/person-surfaces.ts` lists every module
  that prints one.
- **The outward claim** (`services/claim.ts#outwardClaim`) is derived, never
  stored.

## Goals / Non-Goals

**Goals:**

- A member sees their notifications in a bell and on a page, and can mark them
  read, with and without JavaScript.
- Notification text in the community's current language.
- The UI spec §4.11 events, with quiet defaults: replies collapse, and only the
  "immediately" rows email outside the digest.
- Email a member can turn off, and a digest on the day they choose, in their own
  time zone.
- One place that decides who may receive a notification.

**Non-Goals:**

- Push, SMS, browser notifications; real-time delivery.
- Per-event email toggles; one-click unsubscribe headers.
- A clean-up job. The page shows the latest 200.
- Treating ownership transfer as a role change (the owner flag isn't a role; left
  for the admin console's own notices).
- The time zone model and formatter themselves — `local-time`.

## Decisions

### `notify` decides who may receive, once

`notify` filters its recipients to **current memberships of `ctx.community`**
before writing, whatever the caller passed, and drops the actor unless
`includeActor`. Every emitter keeps choosing its audience, but none can deliver
into another community or to a person who has left.

**Why:** the requirement "a member who has left is told nothing" was kept today by
each caller remembering. There are about to be twice as many callers.

### Rows carry params; text is rendered when shown

`notification` gains `params` (JSON, nullable). Each kind has a small typed params
shape in one module next to `NotificationKind`:

- `{ title }`, `{ filename, open }`, `{ filename, reason }`, `{ role }`;
- `{ actor }` — a membership id, never a name;
- `{ count }` for collapsed replies.

`summary` stays `NOT NULL` and keeps an English line, for rows written before this
change and as a last resort.

`notificationText(kind, params)` in `$lib/components/notifications/text.ts` maps
each kind to a paraglide message. The load resolves `actor` to a label through
`personLabel` before returning. A row without params renders its stored `summary`.

**Why not store the translated sentence:** it would freeze the language at the
moment of writing, and a community that switches from English to German would
read old notifications in English.

**Why `count` in params, not a column:** only one kind uses it, and nothing
queries by it.

### What is shown when the subject is no longer visible

Titles and filenames in params were visible when the notification was written. A
decision can become restricted afterwards, and a document can be removed.

Before returning items, the list load checks visibility **in one query per subject
type** (the same `visibleTo` helper every read path uses) for the subjects on the
page. An item whose subject is gone or not visible to this member renders as a
generic "No longer available", **without its params or summary**, and opening it
marks it read and goes nowhere.

The same resolver, `notificationTarget(ctx, subjectType, subjectId)`, returns the
href when visible and `null` otherwise:

- `discussion`, `decision` and `definition` go to their pages;
- `document` goes to the workspace;
- `export` goes to the export settings;
- `community` goes to the dashboard (for claim and role events).

### Collapsing replies

A reply notifies the thread's participants (the existing `discussionParticipants`)
with kind `discussion.reply`. If a recipient already has an **unread**
`discussion.reply` for the same discussion, that row is updated —
`params.count + 1`, `created_at = now` — and no row is added. A read row is never
reopened.

- **A proposal** notifies `proposal.posted`, not `discussion.reply`.
- **A mentioned participant** gets the mention for that post and no reply update.

### Mentions are membership tokens

A post may contain `@M-0142`, the membership's number. The markdown parser gains a
`mention` inline node (`{ type: 'mention', seq }`), added to the allowlist in
`$lib/shared/markdown` and rendered by `InlineText` from a `seq → label` map the
discussion load supplies. A number that isn't a current member of this community
renders as the text written and notifies no one.

- **Composer.** With JavaScript, typing `@` opens a listbox of current members,
  by label; choosing one inserts the token. The field keeps focus and points at
  the highlighted option with `aria-activedescendant` (Bits UI's combobox owns a
  single-line input of its own, and this completes a word inside a paragraph).
- **Without JavaScript,** a member types the number, which the members page shows.
- **Writing the notification.** On posting, the server extracts tokens, resolves
  them within the community, drops the author, and writes `discussion.mention`
  (not collapsed) inside the post's transaction.

**Why not `@Name`:** names aren't unique, change, and are blanked by erasure. The
token stays correct through all three and renders as "Former member (M-0142)"
after erasure.

### Opening a notification is a POST

`/c/[slug]/notifications` has two form actions:

- **`open`** (`id`) marks the row read, then redirects 303 to its target, or back
  to the page with `?gone=<id>`.
- **`readAll`** marks every unread row of this member in this community read.

The bell dropdown and the page render each item as a one-button form styled as a
row, posting to that route's actions. `markRead(ids)` is removed; these two are
the only write paths.

**Why not a GET that marks and redirects:** SvelteKit preloads links on hover, and
so do some browsers and mail scanners. A GET that changes state would mark
notifications read that nobody opened.

**Email links** can't post, so they go straight to the subject (resolved when
sending) and do not mark anything read. The notification stays unread until the
member opens it in the app or marks all read.

### The bell

- **Before hydration** the bell is a link to `/c/[slug]/notifications`, with the
  count.
- **After mount** it becomes a Bits UI `Popover` showing the latest 8 items,
  *Mark all as read* and *See all*.
- **Data.** The layout load already computes `unread`; it adds `latest` (8 items,
  visibility-checked as above). There is no endpoint (`docs/01`).
- **The badge** leaves the *Discussions* nav item. The bell shows "99+" above 99,
  and its label says the number in words.

### Events and where they are written

| Kind | Recipients | Written by | Transaction | Email |
|---|---|---|---|---|
| `discussion.reply` | participants | `addMessage` | the post's | digest |
| `discussion.mention` | mentioned members | `addMessage`, `addProposal` | the post's | digest |
| `consent.opened` | eligible | round opening (exists) | the round's | immediate |
| `consent.closing` | eligible, not yet responded | sweep job | the job's | immediate |
| `discussion.quiet` | opener | sweep job | the job's | digest |
| `definition.review_due` | adopted version's author, else creator | sweep job | the job's | digest |
| `membership.role_changed` | the member | `setMemberRole` | the change's | immediate |
| (removal) | the person, email only | `endMembership` | enqueued in it | immediate |
| `claim.withdrawn` | stewards | `claim-check` job | the job's | immediate |

**The sweep** (`notification-sweep`) runs hourly, re-arms itself, and skips
suspended communities. Each rule deduplicates against existing rows, so a rerun
writes nothing new:

- **Consent closing:** open rounds with `closes_at` within 48h. A round without a
  closing time is never reminded.
- **Quiet thread:** open discussions whose `last_activity_at` is 14+ days ago,
  with no `discussion.quiet` for that discussion written after it.
- **Review due:** definitions whose `review_due_at` has passed, with no
  `definition.review_due` for that definition written after that date.
- **Claims:** enqueues `claim-check` for each active community.

**The claim check** is its own job, `claim-check` `{ communityId }`, so its work
never runs inside a write lock:

1. Compute `outwardClaim`.
2. If `community.claim_compliant` was true and the claim is now false, notify
   stewards.
3. Store the new value either way. The first check records silently.

A freeze **enqueues** `claim-check` for its community in its own transaction, so
the common cause of a withdrawal is told within seconds; the hourly sweep catches
the rest (a standard change, an expiring exception).

**Removal.** A removed person can no longer open the community, so an in-app row
would be unreadable. The exception to "a member who has left is told nothing" is
the removal itself, by email, enqueued in `endMembership`'s transaction with the
user id and community name captured then. It says nothing about who removed them
or why. An erasure that ends memberships sends no removal email.

### Immediate email: a job after commit

Acts that warrant immediate email enqueue `notification-mail` in the same
transaction as the row: `{ notificationId }`, or for removal
`{ userId, communityName }`. The job:

1. Loads the row, recipient and community.
2. Skips when:
   - the membership has ended (except removal);
   - `email_enabled` is false;
   - the user is erased or unverified;
   - the community is suspended (except removal).
3. Renders subject and body in the **community's** locale, with dates in the
   **recipient's** time zone (`local-time`).
4. Sends with `kind` and `communityId` for failure recording.

A body is:

- a subject line;
- one sentence naming the kind of event and the community;
- a link to the subject;
- a link to preferences.

It never carries discussion, proposal, definition or decision text.

**Why a job:** mail must never hold a write lock (the existing "freezing sends no
mail" rule), and a failed send must not undo a role change.

### Preferences and the per-member digest

`membership` gains:

- `email_enabled` (boolean, default true);
- `digest_day` (0–6, default 1 = Monday);
- `last_digest_at` (timestamp, nullable).

`/c/[slug]/notifications/settings` lets a member change their own (a two-field
form, `community.read`, acting only on `ctx.membership`). The page shows the time
zone digests follow, with a link to change it on the account page (`local-time`).

The `weekly-digest` job is replaced by `digest`, which runs **hourly**. A member
is due when all of these hold:

- it is past 07:00 on their `digest_day` **in their own time zone**;
- `email_enabled` is true;
- their `last_digest_at` is more than six days ago.

It sends each due member their digest and stamps `last_digest_at` per member. The
body adds that member's unread counts by kind ("2 replies, 1 mention") to the
community's counts. A member with nothing to report is skipped and still stamped,
so they aren't re-checked every hour of that day.

**Why hourly:** members span time zones, so "Monday morning" arrives at a
different hour for each.

**Why per membership, not per user:** a person in two communities may want the
lively one weekly and the quiet one never. Invitation and account mail aren't
governed by this.

### Person surfaces, tenancy and erasure

- **No names in params.** Params store membership ids, never names or emails.
  Labels are resolved at read time through `personLabel`.
- **Mention tokens** store the number, never a name.
- **Filenames** in params are listed in `docs/13-data-inventory.md`.
- **Person surfaces.** `notifications.ts` (actor labels) and the discussion load's
  mention label map join `tests/support/person-surfaces.ts`.
- **Tenant registry.** New services join it, and the cross-tenant suite seeds a
  notification subject.

## Risks / Trade-offs

- **[A reply storm still produces many emails]** → Replies never email
  immediately; they go to the digest as a count.
- **[A claim withdrawn by something other than a freeze is told up to an hour
  late]** → The hourly sweep catches it. Recorded against §4.11's "immediately".
- **[Mentions by number are unfriendly without JavaScript]** → The composer inserts
  them with JavaScript, and the members page shows the numbers. A typed name that
  isn't a token is harmless text.
- **[`proposal.posted` is written after its transaction]** → It predates this
  change. The optional task moves it in.
- **[The list's visibility check costs queries]** → At most one per subject type
  per load, over at most 200 ids, on indexed primary keys.
- **[Stale bell in another tab]** → It refreshes on the next navigation. Real-time
  delivery is a non-goal.
- **[A member with no time zone set]** → `local-time` falls back to the
  community's, then UTC.

## Migration Plan

1. One migration:
   - `notification.params`;
   - `membership.email_enabled`, `digest_day` and `last_digest_at`;
   - `community.claim_compliant` (nullable);
   - delete any pending `weekly-digest` job.
2. Backfill: nothing. Existing rows render their `summary`. The first claim check
   records without notifying.
3. Boot: enqueue `notification-sweep` and `digest` if absent.
4. Rollback: the previous build ignores the new columns, and its weekly digest
   resumes on its next boot.

## Open Questions

_None blocking._ The tuning values are constants to revisit after the pilot: 8 in
the dropdown, 99+, 48h, 14 days, hourly sweep, a 07:00 digest.

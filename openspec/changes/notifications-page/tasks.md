## 0. Prerequisite

- [x] 0.1 `local-time` is applied: `user.time_zone`, the shared formatter and the account-page setting exist

## 1. The notification model

- [x] 1.1 Migration: `notification.params` (JSON, nullable); `membership.email_enabled` (default true), `digest_day` (default 1), `last_digest_at`; `community.claim_compliant` (nullable); delete any pending `weekly-digest` job. Hand-check the generated SQL for table rebuilds and restore ON DELETE clauses if drizzle-kit drops them
- [x] 1.2 `docs/13-data-inventory.md` rows for the new columns (params can carry titles and filenames; people only as membership ids)
- [x] 1.3 One kinds module: `NotificationKind` gains `discussion.reply`, `discussion.mention`, `consent.closing`, `discussion.quiet`, `membership.role_changed`, `claim.withdrawn`, each with a typed params shape; `notify` takes `params`, still writes an English `summary`, and filters recipients to current memberships of `ctx.community` before writing
- [x] 1.4 `notificationTarget(ctx, subjectType, subjectId)` → href or null, and a batched `visibleSubjects(ctx, items)` (one query per subject type, through `visibleTo`); `community` subject type for claim and role events
- [x] 1.5 `notificationText(kind, params)` through paraglide messages, the stored `summary` as fallback; messages for every kind in en, de and es
- [x] 1.6 Tests:
  - migration upgrade test;
  - unit: every kind has a message in every locale and a params shape;
  - integration: `notify` drops ended and foreign memberships; `notificationTarget` is null for a deleted document, a restricted decision and another community's subject; `visibleSubjects` issues one query per type for 200 items

## 2. Reading and marking read

- [x] 2.1 Services:
  - `listNotificationItems(ctx, limit)`: items with the unread flag, actor labels through `personLabel`, and no params for subjects that aren't visible;
  - `markAllRead(ctx)`;
  - `openNotification(ctx, id)` → href or null, marking read either way.
  - Remove `markRead(ids)`. Register the new services in the tenant registry and seed the cross-tenant suite
- [x] 2.2 Route `/c/[slug]/notifications`: load (latest 200, unread count); actions `open` (303 to target, or back with `?gone=`) and `readAll` through the shared `run` helper; allowed in a suspended community
- [x] 2.3 Layout load adds `latest` (8 items) beside `unread`; remove the unread badge from the *Discussions* nav item
- [x] 2.4 Page UI: items as one-button forms styled as rows; unread marked by a visually hidden "Unread" and weight as well as colour; times through the shared formatter in the reader's time zone; empty state; "No longer available" for gone or restricted items, and beside `?gone=`
- [x] 2.5 Bookkeeping: `notifications.ts` in `tests/support/person-surfaces.ts`; the new route in `tests/support/routes.ts` (a11y) and passing `route-guards`; i18n ratchet not raised
- [x] 2.6 Tests:
  - integration: only `openNotification` and `markAllRead` mark read; another member's id answers not found and marks nothing; 250 unread counted with 200 listed; a suspended community can mark read; a restricted subject's item carries no title
  - e2e: opening an item lands on the discussion and the count drops; *Mark all as read* zeroes it; a removed document shows "No longer available"; loading or preloading the page marks nothing
  - no-JS: opening an item works

## 3. The bell

- [x] 3.1 `NotificationBell`: a link with the count before hydration; a Bits UI popover after mount with the latest items (the same one-button forms), *Mark all as read* and *See all*; "99+" above 99; labelled "Notifications, N unread"
- [x] 3.2 `TopBar` hosts the bell; no count shown at zero
- [x] 3.3 Gallery entries: none, some and 99+ unread; the popover open; a gone item
- [x] 3.4 Tests:
  - e2e: the bell count, opening, an item reaching its subject, *See all*;
  - another community's count is unaffected (integration: `notifications.test.ts`, "never crosses between two" — the e2e fixture has one community per member);
  - the count updates after a form action on the same page;
  - no-JS: the bell is a link;
  - a11y scan with the popover open at 375 and 1440

## 4. Replies and mentions

- [x] 4.1 Markdown: a `mention` inline node for `@M-0142` in `$lib/shared/markdown`, the parser and `InlineText`, rendered from a `seq → label` map; unknown numbers render as written
- [x] 4.2 Discussion load supplies the label map for the thread's mentions through `personLabel`; listed as a person surface
- [x] 4.3 Composer: `@` opens a listbox of current members by label and inserts the number; the textarea is unchanged without JavaScript (a listbox under the textarea with `aria-activedescendant`, not Bits UI's combobox, which owns its own single-line input)
- [x] 4.4 Emitters:
  - `addMessage` writes `discussion.reply` to participants in its transaction, collapsing into an unread row for the same discussion (`params.count + 1`, `created_at = now`).
  - `addMessage` and `addProposal` extract mentions, resolve them within the community and write `discussion.mention` (actor as membership id), excluding the author.
  - A mentioned participant gets no reply update for that post.
  - A proposal writes `proposal.posted`, not a reply.
- [x] 4.5 Tests:
  - unit: mention parsing; a mention next to HTML stays words; an unknown number renders as text
  - integration:
    - three replies collapse to one;
    - a reply after reading writes a new row;
    - a non-participant gets nothing;
    - another community's number resolves to nobody and writes nothing;
    - a self-mention writes nothing;
    - an erased mentioner renders as a former member;
    - a proposal writes no reply notification
  - e2e: `@` inserts a member, the post shows their name, and their bell shows the mention

## 5. Role changes, removal and immediate email

- [ ] 5.1 `notification-mail` job:
  - loads the row, or the removal payload;
  - skips an ended membership (except removal), email off, an erased or unverified user, and a suspended community (except removal);
  - renders in the community's locale with dates in the recipient's time zone;
  - links to the subject and to preferences;
  - sends with `kind` and `communityId`
- [ ] 5.2 Messages per immediate kind in `mail/messages.ts`: a subject line and one sentence, no content
- [ ] 5.3 Emitters:
  - `setMemberRole` writes `membership.role_changed` and enqueues its mail in one transaction;
  - `endMembership` enqueues the removal mail with no row;
  - consent opening enqueues its mail
- [ ] 5.4 Tests (integration):
  - a role change writes the row and one job, and the acting steward gets nothing;
  - a removal writes no row and one job;
  - an email-off member gets the row and no send;
  - a failed send leaves the role change and records a mail failure;
  - bodies contain no discussion or definition text;
  - an erasure ending a membership sends no removal mail;
  - a suspended community's role change sends no mail

## 6. The sweep and the claim check

- [ ] 6.1 `notification-sweep` job: hourly, re-arming, enqueued at boot if absent, skipping suspended communities
- [ ] 6.2 Consent closing: open rounds with `closes_at` within 48h → `consent.closing` to eligible members without a response, once per round and member, with mail
- [ ] 6.3 Quiet threads: open discussions quiet for 14 days → `discussion.quiet` to the opener, once per quiet spell
- [ ] 6.4 Review due: definitions past `review_due_at` → `definition.review_due` to the adopted version's author (else the creator), once per date
- [ ] 6.5 `claim-check` job `{ communityId }`:
  - computes `outwardClaim`; true → false notifies stewards with mail; always stores `claim_compliant`; the first check is silent;
  - enqueued by the sweep for each active community, and by a freeze in its transaction
- [ ] 6.6 Tests (integration, fixed clock), for each rule:
  - fires once, and not again on a rerun;
  - not for answered, closed, left or no-closing-time cases;
  - the claim check is silent on first run and for never-compliant communities;
  - a freeze that withdraws the claim enqueues the check, and the check notifies stewards only;
  - no sweep work for a suspended community

## 7. Preferences and the per-member digest

- [ ] 7.1 `services/notification-preferences.ts`: read and update own `email_enabled` and `digest_day`, acting only on `ctx.membership`; registered in the tenant registry
- [ ] 7.2 Route `/c/[slug]/notifications/settings`:
  - two fields, working without JavaScript;
  - shows the time zone digests follow, with a link to the account page;
  - says in-app notifications can't be turned off;
  - linked from the notifications page and in the route and a11y lists
- [ ] 7.3 `digest` replaces `weekly-digest`, running hourly:
  - due members are past 07:00 on their `digest_day` in their own time zone, have email on, and a `last_digest_at` older than six days;
  - the body adds their unread counts by kind;
  - `last_digest_at` is stamped per member, including those skipped for having nothing
- [ ] 7.4 Every notification and digest email carries the preferences link; invitation and account mail unchanged
- [ ] 7.5 Tests:
  - integration:
    - email off stops digest and immediate mail but not rows;
    - another community's preferences untouched;
    - a steward cannot change another member's;
    - the digest sends only on the chosen local day, once;
    - two members in different time zones get theirs at their own morning;
    - a rerun sends nothing;
    - the body has counts and no content
  - e2e: change preferences without JavaScript; a former member's settings request answers like a missing community

## 8. Documentation

- [ ] 8.1 `docs/03-data-model.md`: notification params and collapsing, membership email preferences, `claim_compliant`
- [ ] 8.2 `docs/04-security.md`: marking read only by POST, the recipient gate in `notify`, restricted subjects shown without titles, email content rules, the removal-email exception
- [ ] 8.3 `UI Spec — v0.1 (draft).md` §4.11 as built:
  - the bell and page;
  - which events email immediately;
  - the claim check within a minute after a freeze, and within the hour otherwise;
  - digests in each member's time zone
- [x] 8.4 Move `proposal.posted` into the `addProposal` transaction, with a test that a rolled-back proposal leaves no notification

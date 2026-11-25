## Context

Found in a persona click-through of 0.16.0 (2026-11-25). The pieces underneath
mostly exist:

- `services/invitations.ts` has `inviteMember` (supersedes a live invitation to
  the same address), `listInvitations`, `revokeInvitation`; the admin console
  sends the owner's invitation after the transaction commits and never shows the
  link (`admin/communities/new/+page.server.ts`). Nothing a steward can reach
  calls any of them.
- The invitation page creates an account with the server-side `signUpEmail`,
  marks it verified (the invitation is the proof), signs it in and accepts.
  The public `/api/auth/sign-up/*` endpoints answer 404
  (`archive/2026-09-30-closed-sign-up`).
- better-auth 1.7.18 sends a verification mail on sign-up and calls
  `emailVerification.afterEmailVerification(user)` when an address is verified.
- `notify(db, scope, { kind, recipients, mail })` writes in-app notifications for
  current members and enqueues `notification-mail` jobs. Its params never store a
  name.
- Users are never deleted: `erasePerson` tombstones a user and frees the address
  (`authentication` spec, "An erased account cannot be signed in to, and its
  address is free").
- The freeze form is rendered in the thread column "so it works with no
  JavaScript and the server can open it with ?freeze=1"; docs/02 §7 already asks
  for "full-height sheets with a sticky action bar".
- Sign-in resolves its target with `safeRedirectTarget(raw, '/')`, so "no
  target" and "target `/`" are the same thing today.

## Goals / Non-Goals

**Goals:**
- A steward can bring a whole founding group in on day one, by address or by one
  shared link, without the operator.
- Nobody reaches community content through a join link until a steward has let
  them in, and their address is proven before a steward is bothered.
- The freeze is visibly opened, readable on a phone, and records who was
  present as the spec says.
- A signed-in member starts in their community.

**Non-Goals:**
- A first-run checklist or welcome screen (UI spec §4.10). Separate change.
- "Waiting on you" on the dashboard, and notifying all members when a proposal
  is posted. Found in the same click-through; not blockers.
- Changing the freeze form's defaults (type, mechanism). Only its placement and
  the attendee list change.
- Several join links per community, links that expire on their own, or links
  that grant the steward role. One link, member role, on or off.
- Showing an invitation link to a steward when mail fails (the admin console's
  rule stands).
- A community chooser page for people in several communities.

## Decisions

### D1. Batch invitations go through `inviteMember`, one address at a time

`inviteMembers(ctx, { addresses, role })` parses the pasted text (split on
commas, semicolons and whitespace, lower-cased, de-duplicated), refuses more
than 50 addresses (400) and calls `inviteMember` for each, collecting an outcome
per address: `invited`, `already_member`, `not_an_address`. Each invitation is
its own transaction, so one bad address never rolls back the rest. Current
members are reported before the allowance is touched. The route sends the
batch's mails concurrently **after** the service returns, as the admin
console does; a failed send turns that outcome into `mail_failed` and the row is
offered for resending.

Rate limit: 100 invitations per steward per 24 hours (`checkRateLimit(db,
clock, { key: 'invite:<userId>', … })`, the first caller outside the request
hook), counted per address. Beyond it the remaining addresses come
back as `limited` with a plain sentence; nothing fails mid-batch.

*Rejected:* one address per submit (the user chose batches); a single
transaction for the whole batch (one typo would cost twenty invitations).

### D2. Resend is a fresh invitation; withdraw is `revokeInvitation`

`resendInvitation(ctx, invitationId)` reads the pending row (404 across
tenants), calls `inviteMember` with its address, role and owner flag — which
supersedes the old one — and returns the new token for the mail. An expired invitation can be
resent the same way. The pending list shows address, role, sent date and
whether it has expired; only stewards see it (`member.manage`).

### D3. One join link per community, hashed for lookup, sealed for display

Table `community_join_link`: `community_id` (unique), `token_hash` (unique),
`token_sealed`, `created_by`, `created_at`. A row exists while the link is on.

- **Turn on** creates the row with a fresh 32-byte token. **Replace** writes a
  new token into the same row: the old link stops working at once. **Turn off**
  deletes the row. Each writes an audit event (`member.join_link_on` / `_replaced`
  / `_off`).
- The token is looked up by hash, like an invitation. It is also stored
  *sealed* (AES-256-GCM, key derived from `BETTER_AUTH_SECRET` with its own HKDF
  label), because a steward needs to copy the link again next week. Today
  `crypto/sealed.ts` hard-wires the mirror's label into `key()`; `seal` and
  `unseal` gain a `label` argument defaulting to the mirror's, so `mirror.ts` and
  every credential already sealed are unchanged.
- Replacing or turning off the link also deletes the community's join requests
  whose address was never verified: whoever had the old link and never proved
  an address stops holding a place in the queue.
- Stewards only (`member.invite`). The link URL is `/join/<token>`; `join` joins
  `RESERVED_SLUGS` beside `invitations`.

*Rejected:* storing the token in plain (a database copy would hand out a live
link); hash only (the steward could never see it again without replacing it).

### D4. A join request is a row, not a membership; it becomes visible once the address is proven

Table `join_request`: `id`, `community_id`, `user_id`, `created_at`,
`notified_at`. Unique on `(community_id, user_id)`. Deleted when decided.

The `/join/<token>` page (account group, outside `/c/[slug]`; the token names
the community, as an invitation's does):

- **Signed out, valid link:** name and address — **no password**. Anyone the
  link was passed to can type anyone's address; if they also chose the
  password, they would know the password of the account that address goes on
  to verify (found in code review). The answer is always the same — "check your
  inbox" — whatever is true about the address, so the page cannot be used to
  find out who has an account:
  - *no account:* the account is created with no credential, through the
    library's `internalAdapter.createUser` (`auth/join-account.ts`), a join
    request is written, and `sendVerificationEmail({ callbackURL: '/join' })`
    sends the mail.
  - *an unverified account:* `auth.api.sendVerificationEmail({ email,
    callbackURL: '/join' })` sends a fresh one; a request is written if there is
    none.
  - *a verified account:* `auth.api.signInMagicLink({ body: { email,
    callbackURL: '/join/<token>' }, headers })` sends a sign-in link; nothing
    else happens. The password typed is ignored.
- **Signed in, not a member:** one button, "Ask to join". The account is
  verified, so the request is written and stewards are told at once.
- **Signed in, already a member:** redirect to the community.
- **Link off, replaced, unknown, or its community suspended or deleted:** "This
  link does not work any more — ask the person who shared it for a new one."
  Same page for all of them, not a 404, read in the browser's language since no
  community can be named.
- **Password, then waiting — `/join` (no token):** where verification lands.
  An account with no password chooses it first (`setFirstPassword`: the
  library's `setPassword` demands a session under 15 minutes old, which a
  person who comes back later would not have; ours links a credential only
  where none exists, for the signed-in owner). The community layout sends any
  account without a password here too: there is no magic-link sign-in in the
  interface, so someone let in on the session from their verification mail
  would otherwise be locked out when it ends. Then it lists the person's open
  requests: "A steward of <name> will let you in. You
  will get an email." With none, it redirects to `landingFor` (D8); signed out,
  to sign-in. Not tied to the token, so a link replaced while someone was
  verifying does not strand them.

Stewards are told when the address is proven: `afterEmailVerification` calls
`noteVerifiedJoinRequests(db, clock, userId)`, which, for each of that user's
requests with `notified_at` null, sets it and calls `notify` (scope: the
community row, `membership: null`, as the notification sweep does) for the
community's current stewards. Setting `notified_at` first makes it idempotent —
a second verification, or a request written by an already verified account
(which is notified directly), tells nobody twice. The library awaits the hook
without a catch, and a throw would leave the address verified with no session
and no redirect, so the hook catches and logs everything.

The steward list shows only requests whose account is verified. An unverified
request older than 7 days is deleted by the hourly sweep, so an abandoned
sign-up does not hold a place under the cap.

Limits: `/join` joins the request hook's credential prefixes
(`rate-limit-request.ts` `AUTH_PREFIXES`), so its POSTs share the per-address
`AUTH_ATTEMPTS_PER_15MIN` ceiling with sign-in and answer 429 beyond it — one
bucket rather than a second number to keep in step. A community holds at most
50 open requests, verified or not; at the cap the page says to ask a steward
and writes nothing.

*Rejected:* the approval mail doubling as verification (fewer mails, but
stewards would be asked to approve addresses nobody has proven, and a bot could
fill the queue); a request visible before verification.

### D5. Letting someone in, or declining

Both are steward acts (`member.invite`) on the Members page, 404 across tenants.

- **Let in** — one transaction: insert the membership (role `member`,
  `rcosState` as an accepted invitation sets it, next `seq`), delete the request,
  audit `member.joined` with `meta.via = 'join_link'`. After commit:
  `notify(kind 'membership.join_approved', recipients [new membership], mail
  true)`. Being a member now, the person reads it in the bell too.
- **Decline** — one transaction: delete the request, audit
  `member.join_declined` (target: the address, as invitation audits do). After
  commit: a direct mail ("Your request to join <name> wasn't accepted") — they
  are not a member, so `notify` cannot reach them. Then, if the account has
  never held a membership anywhere, has no other open request, and is not a
  platform admin (`isPlatformAdmin(email, emailVerified)`), **and no invitation
  is open to that address anywhere** (erasure revokes those, which would undo
  another community's welcome), it is erased with `erasePerson`, which frees
  the address. The hourly sweep applies the same test to unverified accounts
  older than a week (`eraseAbandonedJoinAccounts`), so names and addresses typed
  into a shared form do not stay forever. `erasePerson`'s own refusals (an
  owner, the last admin) cannot apply to such an account.

A requester may become a member another way while waiting (an email
invitation accepted). `listJoinRequests` leaves out anyone who is already a
current member, and letting such a request in deletes it and creates nothing.

Link lifecycle (`join-link.ts`: on, replace, off, inspect) and request
lifecycle (`join-requests.ts`: request, note, list, admit, decline) are separate
modules. The request module reads the link only through `inspectJoinLink`; the
link module's replace and off clear unverified requests with one query of their
own, so neither imports the other's internals and there is no import cycle.

Both decision services register with `registerTenantService` (subject `join_request`), as does
`resendInvitation` (subject `invitation`), so the cross-tenant suite proves each
refuses another community's id.

*Rejected:* keeping a declined request as a row (nothing needs it; the audit
event is the record); hard-deleting the user (users are tombstoned here, never
deleted).

### D6. Notifications carry no name

New kinds: `membership.join_requested` (params `{}`, recipients: current
stewards, `mail: true`) and `membership.join_approved` (params `{}`, subject
`community` → the dashboard, `mail: true`). The bell reads "Someone asked to
join — review it on Members"; the name is on the Members page, behind
`member.invite`.

The request notification needs a link to Members, and subjects resolve by type
(`notification-subjects.ts`, `notifications/href.ts`), with `community` going
to the dashboard. A new subject type `members` resolves exactly as `community`
does (subject id = the community's id) and links to `/c/<slug>/members`.

A kind is registered in `kinds.ts`, `notifications/text.ts`, the digest's
`KIND_WORDS`, and — for the immediate mail — `notification-mail.ts`
`immediateMail()` and `mail/messages.ts`'s `ImmediateMail`. Mail goes through
the `notification-mail` job, so it follows each member's email preference.

### D7. The freeze opens in a sheet; the no-JavaScript path stays

The freeze form becomes one snippet with two hosts:

- **With JavaScript:** a Bits UI `Dialog` styled as a full-height sheet (right
  edge on wide screens, full screen below 768px), the form body scrolling and
  "Record decision" / "Cancel" in a sticky bar at the bottom. `Dialog` owns focus
  trap, `Esc`, and focus return to the Freeze button.
- **Without JavaScript:** the Freeze button is a link to `?v=N&freeze=1`. The
  server opens the form with `freezeOpen`; until the page has hydrated, the same
  snippet renders in the page at the top of the panel. After hydration the
  in-page copy is not rendered and the sheet is open instead — never both.

"Who was present" lists every current member (`listMembers(ctx)`), those who
answered the selected version ticked, so a steward can record someone who was
in the room but did not answer.

`freeze` today stores whatever attendee ids the form posts: another
community's membership id, or an ended one, is recorded as present. With the
list widened to every member, the service now refuses (400, nothing recorded)
an attendee id that is not a current membership of this community.

Twelve e2e specs and the shared `freezeOnOpenThread` helper find the form as
`getByRole('region', …)`; with JavaScript it is now a `dialog`. They change on
purpose; the a11y `?freeze=1` case scans the open sheet.

*Rejected:* its own page (the user chose a sheet; docs/02 §7 says the same);
taking over the right panel (narrow, and below the thread on a phone).

### D8. Where sign-in lands

`landingFor(db, userId)` in `services/tenancy.ts`, over `communitiesOf` (which
already drops ended memberships and deleted communities): exactly one →
`/c/<slug>`; none but an open join request → `/join`; otherwise `/`. The two-factor step reads the user id from the
library's response (`{ token, user }`), whose type the route currently narrows
to `{ token? }`.
Sign-in, two-factor, and `/sign-in` opened while signed in use it **only when no
`redirectTo` was given**; an explicit target (including `/`) still wins, so the
landing page's own "Sign in" keeps working and deep links survive. The front
page itself is unchanged — the `public-site` spec shows it to everyone.

### D9. Erasure reaches join requests

`erasePerson` deletes the person's open join requests in its transaction, as it
revokes their open invitations: a pending request is a standing copy of the
address on a steward's screen.

### D10. Copy and language

Every new string goes through paraglide in `en`, `de`, `es`. The decline mail is
composed in `mail/messages.ts` in the community's locale; the join page reads in
the community's locale, as the invitation page does. The library's verification
and sign-in mails stay as they are (English, `verificationMessage`,
`magicLinkMessage`) — translating them is not this change.

### D11. End-to-end tests reach the verification link through a test route

E2E has no mail transport (`playwright.config.ts` sets no `SMTP_URL`), and the
seed marks accounts verified directly. The join flow's point is the hook that
runs on verification, so `POST /__test/verification-link { email, callbackURL }`
(behind `ALLOW_TEST_ROUTES`, like the seed) returns a link minted with the
library's own exported `createEmailVerificationToken`, and the spec follows it —
the real `/api/auth/verify-email` and the real hook run. Integration tests read
the same mail from `memoryTransport`.

## Risks / Trade-offs

- **A join link shared publicly invites strangers.** → Nobody sees anything
  until a steward lets them in; the cap and per-IP limit bound the queue;
  replacing the link cuts off whoever has the old one. docs/04 §8 records this as
  an accepted threat.
- **Stewards are mailed for every proven request.** → One mail per request, only
  after verification, and only to stewards; the per-community cap bounds it.
- **Erasing a declined account** removes an account someone just made. → Only
  when it has never belonged to any community, so nothing of theirs exists
  anywhere; the decline mail says they can ask again.
- **`afterEmailVerification` runs inside the library's request.** → It only
  writes rows and enqueues jobs; a failure is logged and never blocks the
  verification. The sweep re-notifies nothing, so a failed hook leaves a request
  with `notified_at` null that stewards still see on the Members page.
- **Two hosts for the freeze form** could drift. → One snippet, rendered in
  exactly one of the two places; the e2e covers both paths.

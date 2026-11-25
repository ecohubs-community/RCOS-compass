## Why

A click-through on 2026-11-25 — a steward, a member and a newly invited member
in a fresh community — found three things that stop a pilot community in its
first week:

- **A steward cannot bring anyone in.** `inviteMember`, `listInvitations` and
  `revokeInvitation` exist and are tested, but only the admin console (for the
  owner) and the test seed call them. The UI spec (§4.9) and docs/04 §1 say
  stewards invite; the Members page has no way to.
- **Freezing looks broken.** "Freeze v2" opens a long form at the end of the
  narrow thread column — about 220px of it visible at 1280×800 — so the click
  appears to do nothing. It is the one act the product exists to record.
  docs/02 §7 already says the freeze is "a full-height sheet with a sticky action
  bar, never a cramped centred dialog".
- **Signing in leads away from the community.** With no `redirectTo`, sign-in
  lands on the marketing page with a "Request pilot access" button; the way in
  is an item in the account menu.

The person running the pilot also asked for a second way in: many communities
do not have everyone's email address, but they do have a group chat. A steward
should be able to share one link, and confirm each person who signs up through
it before they see anything.

What a community loses without this: it cannot be set up without the operator
inviting every member by hand from the admin console; its first decision looks
like a dead button; and every member's first sign-in starts on a sales page.

Reasoning: `UI Spec — v0.1 (draft).md` §4.9 (stewards invite), §4.11 (what may interrupt); `docs/02-component-guidelines.md`
§7 (mobile tiers, the freeze sheet); `docs/04-security.md` §1 (who invites), §3
(invitations, no account without one), §8 (threats accepted);
`docs/13-data-inventory.md` §1–2.

## What Changes

- **Stewards invite from the Members page.** Paste up to 50 addresses (comma or
  one per line), choose member or steward, send. Each address gets its own
  outcome (sent, already a member, not an address, mail failed). Pending
  invitations are listed to stewards with their state (waiting, expired) and can
  be resent or withdrawn. A failed mail is reported and offered for resending;
  the link itself is never shown, as in the admin console.
- **A community can have a join link.** Off by default. A steward turns it on,
  copies it, replaces it (the old one stops working) or turns it off. Whoever
  follows it creates an account (or, if signed in, asks with the one they have)
  and becomes a **join request**, not a member. The address is confirmed by the
  usual verification mail; only then are stewards told — in the app and by mail —
  and only then does the request appear on the Members page. A steward lets the
  person in (they become a member and are mailed "you're in") or declines (they
  are mailed that it was not accepted, and an account that belongs to no
  community is removed). Sign-ups through a link are rate-limited per address
  and capped per community.
- **Freezing opens a sheet.** The freeze form opens in a Bits UI dialog drawn as
  a full-height sheet with a sticky "Record decision" bar, on desktop and phone.
  `?freeze=1` still opens it, and without JavaScript the same form renders in the
  page. "Who was present" offers every current member, with those who answered
  the version pre-ticked — the spec already says a steward can add people; the
  form could not.
- **Sign-in lands in your community.** With no `redirectTo`, a person who
  belongs to exactly one community arrives on its dashboard; with none or
  several, on the front page as today. Same after two-factor, and when
  `/sign-in` is opened while already signed in.
- **BREAKING (for the security model, not for a deployment):** "no account
  without an invitation" becomes "no account without an invitation or a
  community's join link". The public `/api/auth/sign-up/*` endpoints stay closed.

## Capabilities

### New Capabilities
- `join-link`: a community's shareable join link, the join requests it creates,
  and a steward letting people in or declining them.

### Modified Capabilities
- `invitations`: stewards invite from the member list, in batches; pending
  invitations are listed, resent and withdrawn; the "no other door" scenario
  names the join link.
- `authentication`: an account can also be made through a join link; sign-in
  without a target lands in the person's community.
- `decisions`: the freeze form opens as a sheet and offers every current member
  as present.
- `notifications`: stewards are told when someone asks to join; a person let in
  is told.
- `erasure`: erasing a person removes their open join requests.

## Impact

- **Schema:** two new tables, `community_join_link` and `join_request`, one
  Drizzle migration. No change to existing tables.
- **Services:** `invitations.ts` (batch), new `join-requests.ts`, `erasure.ts`,
  `notifications` kinds, `mail/messages.ts`, a post-sign-in target helper.
- **Auth:** `afterEmailVerification` hook in `auth/auth.ts`.
- **Routes:** `c/[slug]/members` (invite, pending, join link, requests),
  new `(account)/join/[token]`, `sign-in` and `sign-in/two-factor` landing,
  `c/[slug]/discussions/[id]` (freeze sheet).
- **Docs:** `docs/04-security.md` §3 and §8, `docs/13-data-inventory.md`.
- **Messages:** new strings in `messages/{en,de,es}.json`.
- **Version:** 0.16.0 → 0.17.0 (minor: stewards can invite and share a join
  link).

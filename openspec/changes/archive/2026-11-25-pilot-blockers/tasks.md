## 1. Sign-in lands in the community

- [x] 1.1 `landingFor(db, userId)` in `services/tenancy.ts` over `communitiesOf`: exactly one → `/c/<slug>`, else `/`. Integration test: none, one, two, deleted community, ended membership
- [x] 1.2 `sign-in` load and action, `sign-in/two-factor` load and action (widen the challenge type to read `user.id`): `landingFor` only when no `redirectTo` was given; an explicit target still wins
- [x] 1.3 e2e (`auth.spec.ts`): a member of one community signs in from `/sign-in` and arrives on the dashboard; a `redirectTo` is honoured; `/sign-in` while signed in goes to the dashboard

## 2. Freeze sheet and who was present

- [x] 2.1 `freeze` refuses (400, nothing written) an attendee id that is not a current membership of the community. Integration tests: a non-respondent current member is counted; another community's membership id refused; an ended membership refused
- [x] 2.2 Discussion load adds the current members (`listMembers`) for the attendee list; respondents to the selected version pre-selected; the fieldset renders whether or not there is a round
- [x] 2.3 Freeze form as one snippet: Bits UI `Dialog` sheet (bottom/full-height on phones, right edge from `md`, after `RequirementRefs.svelte`), form body scrolling, sticky "Record decision" / "Cancel" bar, focus returned to the opener; Freeze button is a link to `?v=N&freeze=1`; in-page render only before hydration
- [x] 2.4 e2e: `freezeOnOpenThread` (`tests/e2e/support.ts`) and the `region` lookups in `discussion-rail.spec.ts` and `loop.spec.ts` move to `getByRole('dialog', …)`; new cases: press Freeze → sheet → record; Escape closes and returns focus; 375px keeps "Record decision" on screen with no sideways scroll; `?freeze=1` with JavaScript disabled records a decision; a member sees no freeze. `a11y.spec.ts` `?freeze=1` scans the open sheet

## 3. Invitations from the Members page

- [x] 3.1 `parseAddresses` (pure, `src/lib/shared`): split on commas, semicolons, whitespace; lower-case; de-duplicate. Unit tests
- [x] 3.2 `inviteMembers(ctx, { addresses, role }, { db })` → per-address outcomes (`invited`, `already_member`, `not_an_address`, `limited`); 50 cap (400); 100 per steward per 24 h via `checkRateLimit`. Integration tests: happy path, already member, not an address, duplicate, 51 refused, limit reached, member denied
- [x] 3.3 `resendInvitation(ctx, invitationId, { db })` → new token, old one dead; registered with `registerTenantService` (subject `invitation`). Integration tests: resend expired, old token refused, member denied; cross-tenant via the registry suite
- [x] 3.4 Members route: load returns pending invitations (stewards only) with an expired flag; actions `invite`, `resend`, `withdraw`, sending mail after the service and reporting `mail_failed` per address
- [x] 3.5 Members page: invite form (addresses, role, send), per-address results, pending list with Resend / Withdraw; copy in `messages/{en,de,es}.json`
- [x] 3.6 e2e (`members.spec.ts`): steward invites a list and reads each outcome (mail fails in e2e, so "not sent" with Resend is the shown state); withdraws one; a member sees no invite form and no pending list

## 4. Join link and join requests

- [x] 4.1 Schema `community_join_link`, `join_request`; `pnpm db:generate`; `docs/03-data-model.md` §3 rows
- [x] 4.2 `crypto/sealed.ts`: `seal`/`unseal` take a `label` defaulting to the mirror's. Unit test: round trip per label; a join-link ciphertext does not open under the mirror label; the mirror tests pass unchanged
- [x] 4.3 `services/join-link.ts`: `joinLinkOf`, `turnOnJoinLink`, `replaceJoinLink`, `turnOffJoinLink` (steward, audit; replace/off delete unverified requests). Integration tests: on/replace/off, token not stored raw, unverified queue cleared, suspended/deleted community reads as a dead link, member denied
- [x] 4.4 `services/join-requests.ts`: `requestToJoin(db, clock, { token, userId })` (cap 50), `noteVerifiedJoinRequests(db, clock, userId)`, `listJoinRequests(ctx)` (verified only), `openRequestsOf(db, userId)`. Integration tests: request written and no membership, member short-circuit, waiting, dead link, cap, notify once on verification, stewards only, verified-only listing
- [x] 4.5 `admitJoinRequest(ctx, id)`, `declineJoinRequest(ctx, id)`; both registered (new subject `join_request`, seeded in `tests/integration/cross-tenant.test.ts`). Integration tests: admit → membership with next seq, role member, `rcosState` as invitations set it, audit `via: join_link`, notification; decline → newcomer erased, account with a membership elsewhere kept, platform admin kept; already decided; a requester who became a member meanwhile is not listed and admitting them creates nothing; member denied
- [x] 4.6 Notification sweep step: delete unverified requests older than 7 days. Integration test
- [x] 4.7 `afterEmailVerification` in `auth/auth.ts` calls `noteVerifiedJoinRequests`, catching and logging. Integration test through the library's verify-email URL from `memoryTransport`; a throwing note still verifies, signs in and redirects
- [x] 4.8 Notification kinds `membership.join_requested`, `membership.join_approved`: `kinds.ts`, `notifications/text.ts`, digest `KIND_WORDS`, `immediateMail()` + `ImmediateMail`, messages en/de/es; new subject type `members` in `notification-subjects.ts` and `notifications/href.ts`. Decline mail in `mail/messages.ts`, community locale. Tests: neither carries name or address; members not told; `members` subject links to Members
- [x] 4.9 `(account)/join/[token]`: signed-out form with one answer for new / unverified / verified addresses (`signUpEmail` with `callbackURL: '/join'`, `sendVerificationEmail`, `signInMagicLink`), signed-in "Ask to join", member redirect, waiting state, dead-link page, community locale. `(account)/join`: the person's open requests, else `landingFor`. `/join` in `AUTH_PREFIXES`; `join` in `RESERVED_SLUGS`; both routes in `tests/support/routes.ts`. Integration tests for each branch, and that no branch says whether the address has an account; unit test that a `/join/<token>` POST is a credential attempt
- [x] 4.10 Members page: join link card (turn on, copy, replace, turn off) and "Asking to join" with Let in / Decline, stewards only
- [x] 4.11 `erasePerson` deletes open join requests. Integration test
- [x] 4.12 `POST /__test/verification-link` (behind `ALLOW_TEST_ROUTES`) minting a link with `createEmailVerificationToken`. e2e: steward turns the link on → visitor signs up → follows the verification link → waiting page → steward lets them in → they open the dashboard; a replaced link shows the dead-link page

## 5. Docs, tests that pin the old door, version

- [x] 5.1 `tests/integration/closed-sign-up.test.ts` and `tests/e2e/auth.spec.ts`: comments and premise name the join link as the second door; the turned-off-link case lives in `join-page.test.ts`, through the route's own action
- [x] 5.2 `docs/04-security.md` §1 (stewards share the join link and decide requests), §3 (no account without an invitation or a join link) and §8 (an accepted threat: a link shared publicly); `docs/13-data-inventory.md` (join requests, join link)
- [x] 5.3 `pnpm version minor --no-git-tag-version` (0.16.0 → 0.17.0)

## 6. Found in code review

- [x] 6.1 Join form takes no password; account made with no credential (`auth/join-account.ts`); first password chosen on `/join` by the verified owner. Tests: no password after submit, a posted password ignored, set once only; e2e password step
- [x] 6.2 Declining keeps an account that holds an open invitation elsewhere; the sweep erases abandoned unverified accounts after a week. Tests for both
- [x] 6.3 Resending keeps the owner flag; current members do not spend the daily allowance; batch mail sent concurrently. Tests
- [x] 6.4 A malformed `/join` escape falls back to the browser's language; the freeze sheet opens only when `?freeze=1` arrives; the Members page's small buttons are 44px tall; "already a member" on letting in; sign-in while waiting lands on `/join`
- [x] 6.5 The community layout sends an account without a password to `/join` to choose one. e2e: let in before choosing, then sent to choose before the dashboard
- [x] 6.6 The invitation page treats an account with no password as no account, and gives it the password from its form; a double submit of the first password leaves one credential. Integration test through the invitation route's own action

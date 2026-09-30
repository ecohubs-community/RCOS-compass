## Why

The instance is invitation-only (`docs/10-legal-and-operations.md`): the
invitation page is the one place an account is meant to be made. But better-auth
serves two public doors at `/api/auth/*` that make one without an invitation,
though nothing in the interface links to them: `POST /sign-up/email`, and a
magic link sent to an address with no account, which creates a verified account
when followed. Both were confirmed open by a failing test.

## What Changes

- The `/api/auth/[...all]` route answers **404 for `/api/auth/sign-up/*`**,
  matched on the decoded, lower-cased, slash-collapsed path. The library's own
  `disableSignUp` is not used for this: it would also refuse the server-side
  `signUpEmail` call the invitation page (and the test seed) makes.
- The magic-link plugin runs with **`disableSignUp: true`**: a link to an
  unknown address still sends (so the answer reveals nothing) and signs nobody
  in.
- `docs/04-security.md` §3 says so.

Unchanged: invitation acceptance, email/password and magic-link sign-in for
existing accounts, two-factor. No migration.

## Capabilities

### Modified Capabilities
- `authentication`: no account is made without an invitation.

## Impact

`src/routes/api/auth/[...all]/+server.ts`, `src/lib/server/auth/auth.ts`,
`tests/integration/closed-sign-up.test.ts`, `tests/e2e/auth.spec.ts`,
`docs/04-security.md`. Version: a patch; ships inside the 0.8.0 bump if it goes
out with `landing-page`.

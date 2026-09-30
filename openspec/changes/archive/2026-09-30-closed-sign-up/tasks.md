## 1. Close the doors

- [x] 1.1 Failing tests first: `tests/integration/closed-sign-up.test.ts` (HTTP sign-up, spellings, magic link to an unknown address; server-side sign-up, magic link for an existing account and sign-in still work)
- [x] 1.2 404 for `/api/auth/sign-up/*` in the auth route, on a normalised path
- [x] 1.3 `magicLink({ disableSignUp: true })`
- [x] 1.4 e2e: `auth.spec.ts` refuses public sign-up; `invitations.spec.ts` still passes
- [x] 1.5 `docs/04-security.md` §3

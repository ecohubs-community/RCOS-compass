## Why

Everything built so far is single-tenant by accident: there are no users, no
communities, and nothing that could belong to one community rather than another.

**The highest-severity risk in the whole product is one community reading
another's data** (`docs/04-security.md` §2). A governance tool holds the
agreements a group made about power, money and exit; a leak across that boundary
is not an embarrassment, it is the end of the product's usefulness. That risk
becomes real the moment there is a second community, so the isolation has to be
structural before any feature stores tenant data — retrofitting it means auditing
every query ever written.

Two more things are load-bearing and cheap now, expensive later:

- **Permissions as data, not as scattered checks.** `docs/04-security.md` §1
  defines a capability matrix. If the first few features hand-roll `if (role ===
  'steward')`, the matrix becomes documentation of something that is no longer
  true, and the drift is a security bug rather than a style problem.
- **The platform admin console.** Every later phase needs a way to create a
  community, and there is none. It also has to be built with its privilege
  boundary intact from the start: an operator sees tenants, never their content.

What a community loses without this: the ability to have members at all. Nothing
in the product works for more than one person until invitations exist.

## What Changes

- **Schema**: users, communities, memberships, invitations, audit events —
  `docs/03-data-model.md` §3, with `community_standard` pinning each community to
  a standard version.
- **better-auth**: email and password, magic link, verified email required,
  TOTP available and required for platform admins.
- **Tenant resolution in the request pipeline**: the community comes from the
  URL, never from a session claim, and a request with no membership 404s rather
  than 403s so existence is not confirmed across the boundary.
- **The permission matrix as a single data structure**, with `requirePermission`
  used by every server load and action, and a table-driven test asserting the
  whole matrix.
- **Invitations end to end**: single-use hashed tokens, bound to the invited
  email, 7-day expiry, consumed in a transaction, sent by mail.
- **The platform admin console**: create, rename, re-slug, limit, suspend and
  soft-delete communities, with the metadata-only boundary enforced by which
  services the admin routes may import.
- **The cross-tenant test suite**, parameterised over a service registry so a new
  service is covered by default rather than by remembering.

## Capabilities

### New Capabilities
- `authentication`: who someone is — sessions, verification, second factor, and what a session may still do when it is not fully established
- `tenancy`: how a request is scoped to one community, and why another community's data is unreachable rather than merely unauthorised
- `authorization`: capabilities, roles, and the single place a permission decision is made
- `invitations`: how a person becomes a member of a community exactly once
- `platform-admin`: what the operator can do, and the boundary they cannot cross

### Modified Capabilities
- `request-pipeline`: the pipeline gains session resolution and tenant scoping, and the rate limit gains a per-user dimension

## Impact

- Adds the first tenant-owned tables; everything after this inherits their shape.
- `hooks.server.ts` grows session and tenant resolution.
- Relies on: `docs/03-data-model.md` §3, §3a · `docs/04-security.md` §1–3, §6 ·
  `docs/05-admin-console.md` · `docs/01-server-client-contract.md` §1, §5.
- Sets the constraint every later phase inherits: no service reaches data without
  a resolved community and an explicit capability check.

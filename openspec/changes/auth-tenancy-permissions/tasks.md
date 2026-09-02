## 1. Schema

- [x] 1.1 `user`, `session`, `account`, `verification`, `two_factor` — shaped to match what better-auth's Drizzle adapter expects, so §2 wires the library to them rather than a parallel set
- [x] 1.2 `community` (slug, locale, timezone, status, publish_names_policy, limits), `community_standard` pinning the core version
- [x] 1.3 `membership` — role `steward|member`, `is_owner` flag, `rcos_state`, unique per (community, user)
- [x] 1.4 `invitation` — hashed token, invited role, expiry, accepted_at, unique pending per (community, email)
- [x] 1.5 `audit_event` — append-only, platform-wide, indexed by time and community
- [x] 1.6 Tests: migrations apply; the partial unique indexes behave; a membership cannot name role `owner`

## 2. Authentication

- [x] 2.1 better-auth wired to Drizzle, email+password and magic link, verification required
- [x] 2.2 Session cookie hardening and absolute lifetime; server-side revocation
- [ ] 2.3 TOTP enrolment and challenge; required for platform admins only
- [ ] 2.4 Auth rate limits reusing the existing limiter; failures written to `audit_event`
- [x] 2.5 Tests (partial — TOTP cases land with 2.3): unverified session is withheld from communities; revoked session refused; expired session refused; no user enumeration on sign-in or reset; admin without TOTP cannot reach admin routes

## 3. Tenancy

- [x] 3.1 `resolveCommunity` in the pipeline: slug from the URL, membership looked up per request, `locals.community` and `locals.membership` set
- [x] 3.2 404 — never 403 — for a community the user does not belong to, and for soft-deleted ones; suspended communities are read-and-export only
- [x] 3.3 `ctx` object threaded into services; no service signature accepts a community id from input
- [x] 3.4 Tests: switching communities carries nothing over; membership removal and role change take effect on the next request; a suspended community refuses writes

## 4. Authorization

- [x] 4.1 `permissions.ts` — the capability matrix from `docs/04-security.md` §1 as one literal map
- [x] 4.2 `requirePermission(ctx, capability)` and a `can()` for shaping UI, both reading the same map
- [x] 4.3 ESLint rule forbidding inline role comparison outside `permissions.ts`
- [x] 4.4 Tests: the full matrix table-driven; a new capability without an entry fails; owner-only actions refused to a plain steward; the inline-role lint rule fires

## 5. Cross-tenant isolation

- [x] 5.1 A service registry, so the isolation suite enumerates services rather than trusting a list someone maintains
- [x] 5.2 The parameterised cross-tenant suite: for every service, a B member with an A resource id gets nothing
- [x] 5.3 The route guard sweep: every server file under `(app)` and `(admin)` calls `requirePermission`
- [x] 5.4 Tests are the deliverable here; there is no feature code

## 6. Invitations

- [ ] 6.1 Create, list, revoke; hashed single-use token bound to the email, 7-day expiry
- [ ] 6.2 Acceptance in one transaction, idempotent under a race
- [ ] 6.3 SMTP transport behind the existing mail interface; invitation mail carries a link and no content
- [ ] 6.4 Tests: reuse refused; wrong address refused; expiry refused; concurrent acceptance yields one membership; the raw token is absent from the database; mail body carries no content

## 7. Platform admin console

- [ ] 7.1 `(admin)` route group guarded in hooks, in the layout load, and in every action
- [ ] 7.2 Tenant list and detail — metadata only, from `services/admin/*` which may not import content services
- [ ] 7.3 Create, rename, re-slug with redirect, limits, feature flags, suspend, soft-delete with restore, transfer ownership
- [ ] 7.4 Platform audit log view and instance status
- [ ] 7.5 Tests: `docs/05-admin-console.md` §6 in full, plus the import-boundary assertion

## 8. Pipeline

- [ ] 8.1 Per-user rate limiting alongside per-IP; auth endpoints get their own tighter ceiling
- [ ] 8.2 Logs carry community and actor once resolved, still no content
- [ ] 8.3 Tests: one member's ceiling does not affect another; auth endpoints limit sooner

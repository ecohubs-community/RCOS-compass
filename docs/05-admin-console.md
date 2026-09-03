---
status: draft for discussion
version: 0.1
date: 2026-08-31
---

# Platform Admin Console

A single-operator back office for the person running the hosted instance. It
manages **tenants**, not governance. Nothing in here is a community feature, and
nothing in here reads a community's content.

---

## 1. Who is an admin

```
ADMIN_EMAILS=stefan@example.org,ops@example.org
```

- Comma-separated, trimmed, lower-cased, compared against the user's **verified**
  email on every request. Never stored in the database, never cached in the session.
- Empty or unset ⇒ the `/admin` route group does not exist (404 for everyone).
- **TOTP two-factor required.** An admin-email user without 2FA enrolled is
  redirected to enrolment and can reach nothing else under `/admin`.
- Admins are ordinary users elsewhere: being an admin grants no rights inside any
  community. To work inside a community, an admin joins it like anyone else.

## 2. The privilege boundary (the important part)

**Platform admin sees metadata. Never content.**

Visible: community name, slug, status, created date, member count by role,
storage used, AI tokens used, last activity date, plan/limits, owner contact.

Not visible, not queryable, not exportable from `/admin`: definitions,
discussions, proposals, decision bodies, documents, passages, evidence, learning
entries, member personal data beyond the owner's contact email.

This is enforced by the services `/admin` is allowed to call — the admin route
group imports from `src/lib/server/services/admin/*` only, and those services
never join to content tables. A test asserts the import boundary.

Reason to be strict: the product asks communities to put their most sensitive
structural agreements in someone else's software. "The operator technically
could" is unavoidable at the database level; "the operator's own UI cannot" is
achievable, cheap, and the difference between a promise and a policy.

## 3. Screens

### 3.1 Tenants (list) — `/admin/communities`

Dense table, same visual language as the rest of the app: name · slug · status
(`active` / `suspended` / `deleted`) · members · storage · AI tokens this month ·
created · last activity. Search by name/slug/owner email. Filters by status.
Sort by created and last activity. Row → detail.

### 3.2 Create a tenant — `/admin/communities/new`

Fields: name, slug (validated: lowercase, `a-z0-9-`, 3–40 chars, reserved-word
list — `admin`, `api`, `public`, `healthz`, `new`, `c`), owner email, locale,
timezone, standard version, optional limits.

On submit, in one transaction: create the community, create a **steward
invitation carrying the owner flag** for that email, send it, write an audit
event. **The admin does not become a member.** A community whose first
invitation has not been accepted shows as `pending owner` until someone does.
(There is no `owner` *role* — see `04-security.md` §1: two roles, and the owner is
a flag on one steward's membership.)

### 3.3 Tenant detail — `/admin/communities/[id]`

Metadata, quota usage, invitation status, and the audit trail for this tenant's
administrative events. Actions:

- **Rename** — free.
- **Change slug** — the old slug redirects for 90 days (permalinks are a product
  promise); requires the current address to be typed out, because it breaks
  pasted links. A **308**, not a 301: it preserves the method, so a form post to
  an old address is not silently turned into a GET. The redirect is offered only
  to someone who would be let into the community it points at — `not_found`
  covers both "no such community" and "not a member", so redirecting on it alone
  would tell a stranger that the old slug existed and what it became.
  A retired slug is not handed to another community while it still redirects:
  pointing old links at the wrong community is worse than breaking them.
- **Limits** — max members, storage MB, monthly AI tokens; blank = instance default.
- **Feature flags** — AI on/off, git mirror on/off, public index on/off.
- **Suspend / unsuspend** — members see a read-only banner and can still export.
  Suspension never deletes anything. Reason required, shown to the owner.
- **Transfer ownership** — move the owner flag to another steward with an accepted membership. If the community has only one steward, promote someone first; the flag never sits on a `member`.
- **Delete** — soft delete, requires typing the slug, sets `deleted_at`, hides the
  tenant everywhere, keeps data for a 30-day grace window, then a purge job removes
  rows and files. **Restore** available during the window. Owner is emailed at both
  ends. Hard delete is never a button; it is a job.

### 3.4 Platform audit log — `/admin/audit`

Every `audit_event`, newest first, filterable by actor, action, and community.
Read-only, including for admins. Retention 400 days. Shows: at, actor email, IP,
action, target, and a diff summary for updates.

### 3.5 Instance status — `/admin/status`

Build SHA, migration version, DB size, queue depth (mirror pushes, exports,
extraction), failed jobs with retry, AI spend this month across tenants, mail
delivery failures. This is the page that answers "is anything broken right now".

## 4. What the admin console deliberately does not have

- **No impersonation / login-as** in MVP. If support proves it necessary, it ships
  as the break-glass path in `04-security.md` §6 — time-boxed, reason-required,
  owner-notified, and visible in the community's own change log — or it does not ship.
- No content search across tenants.
- No ability to create, edit, or delete definitions, decisions, or documents.
- No bulk email to members.
- No admin API tokens. The console is interactive-only.

## 5. Security requirements (recap, all testable)

1. Guard in `hooks.server.ts`, again in `/admin/+layout.server.ts`, again in every
   action.
2. Non-admin GET of any `/admin/*` path ⇒ 404, no redirect that confirms existence.
3. Admin session without 2FA ⇒ enrolment only.
4. Every mutating action ⇒ one `audit_event` with actor, IP, target, before/after.
5. Destructive actions (delete, suspend, slug change, limit reduction) ⇒ typed
   confirmation plus a reason field stored on the event.
6. Rate limit: 60 admin actions/hour, and admin login attempts are limited and
   alerted on.
7. Removing an email from `ADMIN_EMAILS` and restarting ⇒ that user's next
   `/admin` request 404s.

## 6. Acceptance tests

- Unauthenticated users, ordinary members, and stewards (including a community
  owner) each get 404 on `/admin`, `/admin/communities`, and a valid community
  detail URL. Being a steward of every community on the instance still grants
  nothing here.
- Admin without 2FA cannot reach the tenant list.
- Creating a tenant produces exactly one community, one pending steward
  invitation carrying the owner flag, one default *Community Agreements* artifact,
  one audit event, and no membership for the admin.
- An invitation with `role = 'owner'` is rejected — owner is a flag, not a role.
- Slug uniqueness and the reserved-word list are enforced server-side.
- Deleting a tenant hides it from members immediately, keeps rows for 30 days,
  and restore returns the community intact.
- An admin-authenticated request to any content service throws — proved by the
  import-boundary test plus one integration test per admin service.
- `ADMIN_EMAILS` matching is case-insensitive, whitespace-tolerant, and rejects an
  unverified email.

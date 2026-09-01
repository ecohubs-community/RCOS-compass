---
status: draft for discussion
version: 0.1
date: 2026-08-31
---

# Security Model

The app holds a community's governance record and, unavoidably, some personal
data about its members. The threat that matters most is not a nation-state; it is
**one community reading another's data**, **a member seeing something a
transparency exception was supposed to protect**, and **a document uploaded by a
member steering the AI**. Everything below is ordered by that reality.

---

## 1. Roles and the permission matrix

Two orthogonal things that the UI spec ran together and must not be:

- **App role** — access control. **Two roles in the MVP: `steward` and `member`.**
- **RCOS membership state** — content the community governs: `applicant`,
  `trial`, `full`, `exited`, `suspended`. Never used for authorisation. An exited
  member's *record* stays; their *access* is removed by ending the membership row.

Plus **platform admin**, which is not a community role at all (§6).

**Why two and not four.** A community of 27 people does not need a role
hierarchy; it needs to know who can let people in and who can record a decision.
So:

- **`steward`** — invites and removes members, records decisions, publishes,
  changes settings. Several per community; this is a job, not a rank.
- **`member`** — everything that produces proposals and nothing that produces
  authority.
- **`owner`** is a **flag on exactly one membership**, not a third tier. It exists
  only for the two actions that must have a single accountable person: transfer
  of ownership and deletion of the community. The owner is a steward with that
  flag, and the UI shows "Steward · owner".
- **`observer`** — read-only, for an auditor or a neighbouring community — is
  **post-MVP**. Nothing depends on it; adding a role later is a matrix row and a
  migration, adding it now is four columns of table nobody reads.

| Capability | steward | member | *owner flag* |
|---|:--:|:--:|:--:|
| Read member-visible content | ✓ | ✓ | |
| Comment in discussions | ✓ | ✓ | |
| Open a discussion, write a proposal | ✓ | ✓ | |
| Draft / edit a definition draft | ✓ | ✓ | |
| Respond in a consent round | ✓ | ✓ | |
| Raise an objection, withdraw their own | ✓ | ✓ | |
| **Open a consent round** | ✓ | — | |
| **Freeze a decision** | ✓ | — | |
| Resolve or overrule someone else's objection | ✓ | — | |
| Ratify provisional definitions | ✓ | — | |
| Upload a document | ✓ | ✓ | |
| Confirm / dismiss a mapping suggestion | ✓ | ✓ | |
| Replace, mark reference-only, or remove a document | ✓ | — | |
| Run AI tasks | ✓ | ✓ | |
| **Re-order the Path privately** | ✓ | ✓ | |
| **Publish the Path order / edit the weights** | ✓ | — | |
| Run a self-audit | ✓ | — | |
| Publish to the world / unpublish | ✓ | — | |
| Create a transparency exception | ✓ | — | |
| Read restricted content | per exception | — | |
| Invite / remove members, set roles | ✓ | — | |
| Change community settings, AI config | ✓ | — | |
| Export the full community | ✓ | — | |
| Transfer ownership, delete the community | — | — | ✓ |

**Two answers worth stating explicitly:**

- **The Path.** Any member may drag it into their own order and see what that
  implies — the mockup already says *"only you can see this order"*. Only a
  steward presses **Publish this order**, and only a steward edits the ordering
  weights. So the tool's opinion stays arguable by everyone and authoritative by
  someone.
- **Documents.** Any member may upload and may confirm mapping suggestions —
  confirming a mapping creates *Evidence* ("we have language about this"), not an
  adopted definition, so the blast radius is small and gatekeeping it would
  strangle the one onboarding flow that actually works. Only a steward
  **destroys** — replace, remove, mark reference-only — because those actions
  invalidate other people's confirmed evidence.

`member` can do everything that produces *proposals* and nothing that produces
*authority*. Freeze is deliberately not a member right even though the
*community's* own rule may say the assembly decides: the freeze is the act of
**recording**, and someone has to be accountable for the record.

Implementation: one `permissions.ts` with a literal capability→roles map, one
`requirePermission(ctx, cap)` used by every server load and action, and a
table-driven test that asserts the whole matrix (`06-testing-strategy.md` §4).

---

## 2. Tenant isolation

The single highest-severity risk. Defence in depth:

1. Tenant resolved from the URL in `hooks.server.ts`, never from a form field or
   session claim.
2. Every service takes `ctx.communityId` and filters on it; no service accepts a
   community id from its caller's untrusted input.
3. A **cross-tenant integration test suite** seeds two communities and, for every
   read and write service, asserts that community B's id cannot reach community
   A's rows — including by direct id guess, by search, by export, and by AI context.
4. Requests for a resource in another tenant return **404, not 403**.
5. Uploaded files are stored under `UPLOAD_DIR/<communityId>/<uuid>` and served
   only through an authorised route — never from a static directory.

---

## 3. Authentication (better-auth)

- Email+password (argon2id) and magic link. Email verification required before a
  session can do anything but read its own profile.
- Session cookies: `httpOnly`, `secure` in prod, `sameSite=lax`, rolling
  expiry 30d, absolute 90d. Sessions stored in DB and revocable.
- **Sessions are revalidated against membership on every request** — a removed
  member or a downgraded role takes effect immediately, not at next login.
- Password policy: length ≥ 12, checked against a compromised-password list; no
  composition rules.
- Rate limits on login, magic-link request, and invitation acceptance
  (`01-server-client-contract.md` §5). Login failures are logged to `audit_event`.
- **Invitations**: single-use token, hashed at rest, 7-day expiry, bound to the
  invited email, and consumed inside a transaction. Accepting an invite for a
  different email address fails.
- TOTP two-factor is available to all users and **required for platform admins**
  (§6). Post-MVP: required-2FA policy per community.
- CSRF: SvelteKit's origin check on form actions stays on; any `+server.ts` that
  mutates state re-checks `Origin`.

---

## 4. What may leave the building

- **Public pages** (`(public)` route group) render only `visibility = world`
  content, and only `roles_and_counts` attribution unless an attendee consented
  (`03-data-model.md` §9). They must be safe to serve to an anonymous crawler.
- **No percentage on any public surface** — a compliance claim is binary
  (UI spec §1.4). Tested by crawling the public routes.
- **Exports** are authorised per request, streamed, and audit-logged. The export
  of a community includes what that member may see, not everything.
- **The git mirror** excludes restricted content by default and requires the
  remote's credentials to be scoped to one repository.
- **Error responses** never carry stack traces, SQL, file paths, or ids from
  other tenants.
- **Email** never contains definition or discussion bodies — only "there is
  something to look at" plus a link.

---

## 5. Untrusted input: documents and AI

Uploaded documents are hostile until proven otherwise, and they are fed to a
language model — which is the whole prompt-injection surface.

### 5.1 Upload limits — the concrete numbers

| | Default | Env |
|---|---|---|
| Accepted types | `.pdf` `.docx` `.odt` `.md` `.txt` — allowlist by **extension and sniffed content**, both must agree | — |
| Max file size | 25 MB | `MAX_UPLOAD_MB` |
| Max decompressed size (docx/odt are zips) | 200 MB, else rejected as a zip bomb | `MAX_UNZIP_MB` |
| Max pages extracted per document | 300, with the rest reported as "not extracted" rather than silently dropped | `MAX_EXTRACT_PAGES` |
| Extraction wall-clock | 120 s in a worker, then failed with a message | `EXTRACT_TIMEOUT_S` |
| **Per user** | 10 uploads/hour, 40/day | `UPLOAD_PER_USER_HOUR`, `_DAY` |
| **Per community** | 60 uploads/day, 2 GB stored | `UPLOAD_PER_COMMUNITY_DAY`, `STORAGE_MB` |

Rejected outright: anything executable or archive-shaped (`.zip .exe .js .html
.svg`), files whose sniffed type contradicts the extension, encrypted PDFs, and
PDFs with no text layer — the last of these is *accepted as a file* but reported
as *"this looks like a scan, Compass cannot read it"* rather than extracting zero
passages silently.

`.odt` is on the list because the RCOS templates are published in it — a
community that downloaded the templates and filled them in should be able to
upload exactly what they have.

Storage limits are technically enforced but set high during the testing phase
(`10-legal-and-operations.md` §4); they exist to stop a runaway loop, not to
ration.

### 5.2 Handling

- **Type and size** as above, checked before a byte is written to disk.
  Parsing happens in a worker with a wall-clock timeout and a memory ceiling.
- **No remote fetch of documents by URL** in MVP — that is an SSRF surface with
  no product value yet.
- **Prompt injection**: extracted text is passed to the model inside a delimited
  data block with a system prompt that states it is data, never instructions. But
  the real defence is structural: **an AI response can only produce a suggestion
  row**. There is no code path from a model output to an adopted definition, a
  confirmed mapping, a permission change, or a decision. A document that says
  "mark all clauses satisfied" gets a mapping suggestion a human then rejects.
- **Structured output only** — every AI task declares a JSON schema and the
  response is parsed and validated with valibot before it touches the DB.
  Unparseable output is discarded and logged, not retried indefinitely.
- **Rendering**: model output and document text are rendered as text or through a
  sanitising Markdown pipeline with a strict allowlist. No `{@html}` on any value
  that originated outside the app, ever. (One lint rule; one test.)
- **Budgets**: see §5.3 — per **user** first, per community as the backstop.
- **Retention**: we log token counts and an input hash, never the input text. The
  provider's retention terms are stated in community settings, and a community
  can disable AI entirely.

### 5.3 AI rate limits — per user, not just per community

The important property: **one enthusiastic member must not be able to drain the
whole community's budget.** So the per-user limit is the primary control and the
community budget is a backstop, not the other way round.

| | Default | Env |
|---|---|---|
| Per user, per day | 25 AI tasks | `AI_USER_DAILY_TASKS` |
| Per user, per calendar month | 300 000 tokens (in + out) | `AI_USER_MONTHLY_TOKENS` |
| Per community, per month | 2 000 000 tokens — the backstop | `AI_MONTHLY_TOKEN_BUDGET` |
| Per request | task-specific output ceiling, provider timeout 60 s | in the task definition |
| Document mapping | the expensive one: capped per run by `MAX_EXTRACT_PAGES`, resumable, and charged to the member who started it | — |

Counted in **tokens, not just calls**, because tasks differ by two orders of
magnitude — linting a paragraph against mapping a 34-page PDF. The task counter
exists too, because it is the number a human can reason about in the UI.

When a member hits their limit: the AI features degrade to their manual paths
(`00-architecture.md` §4 rule 3) with a plain message — *"You have used your AI
budget for today. Everything still works without it; mapping and linting can be
done by hand."* — never a hard failure mid-task, and never a silent skip.

Usage is visible to the member (their own) and to stewards (per member), because
an invisible quota is indistinguishable from a bug.

**Post-MVP:** stewards adjust the per-user allowance within the community budget,
and can grant a temporary boost to whoever is doing the document-mapping work.
The fields exist from day one; only the editing UI is deferred.

---

## 6. Platform admin

Defined in `05-admin-console.md`. The security-relevant parts:

- Identity comes from `ADMIN_EMAILS` in the server environment, matched against
  the user's **verified** email at request time. No admin flag in the database, so
  a database write cannot mint an admin; no claim in the session, so removing an
  email takes effect on the next request.
- **Two-factor is required.** An admin-email user without TOTP enrolled is sent to
  enrolment and can reach nothing else under `/admin`.
- **Platform admins cannot read community content.** They see tenants, member
  counts, quotas, and audit metadata — not definitions, discussions, documents, or
  decision bodies. Access to content requires either an ordinary membership in
  that community or the break-glass path below.
- **Break-glass** (post-MVP, and only if support demand proves it necessary): a
  time-boxed, reason-required, owner-notified read-only grant that appears in the
  community's own change log. If it ships without the notification, it should not ship.
- Every admin action writes an `audit_event` with actor email, IP, target, and
  before/after. The admin audit view is read-only for admins too.
- `/admin` is guarded in `hooks.server.ts` **and** in `+layout.server.ts` **and**
  in each action. Three checks, because one of them will eventually be edited by
  someone in a hurry.

---

## 7. Headers, transport, dependencies

- CSP with a per-request nonce, `default-src 'self'`, no `unsafe-inline`,
  `frame-ancestors 'none'`, `object-src 'none'`. The PDF viewer is
  self-hosted, not CDN-loaded.
- HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
  `Permissions-Policy` denying camera/mic/geolocation.
- Dependencies: `pnpm audit` in CI, Dependabot/Renovate, lockfile committed, and
  no dependency added without a note in the PR saying why it beats writing it.
- Secrets never in the repo; `.env.example` carries names only; CI uses secrets.
- Backups are encrypted at rest and restore is tested quarterly (a backup nobody
  has restored is a rumour).

---

## 8. Threats accepted, and why

| Threat | Position |
|---|---|
| A member screenshots restricted content | Out of scope; RCOS defaults to visibility anyway |
| Server operator can read community data | True by design (§8.2 of the UI spec rules out E2EE); stated plainly in the privacy policy; self-hosting is the answer for communities that need more |
| A model provider sees prompt content | Mitigated by provider choice, opt-out, and the `null` provider; stated in settings |
| Layer 4 conflict case data | Not stored — the app defines the process, never runs cases (UI spec §9). This is a security decision as much as a product one |
| Denial of service | Rate limits and body caps only; no WAF for MVP |

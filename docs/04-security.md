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
| Create a **local** definition (§ UI spec 1.4b) | ✓ | ✓ | |
| Create / rename a community artifact | ✓ | — | |
| Record RCOS feedback ("the standard should require this") | ✓ | ✓ | |
| Share RCOS feedback upstream | ✓ | — | |
| Respond in a consent round | ✓ | ✓ | |
| Raise an objection, withdraw their own | ✓ | ✓ | |
| **Open a consent round** | ✓ | — | |
| **Freeze a decision** | ✓ | — | |
| Resolve or overrule someone else's objection | ✓ | — | |
| Ratify provisional definitions | ✓ | — | |
| Upload a document | ✓ | ✓ | |
| Confirm / dismiss a mapping suggestion, map by hand, mark mapping as done | ✓ | ✓ | |
| Start or continue a document scan (charged to whoever starts it) | ✓ | ✓ | |
| Replace a document's file, restore an earlier version | ✓ | ✓ | |
| Remove a document, delete an earlier version for good | ✓ | — | |
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
  strangle the one onboarding flow that actually works. Any member may also
  **replace** a file, because the earlier file is kept as a version anyone can
  restore — a mistaken or harmful replacement is one click from undone, and
  claims it made stale can be re-confirmed. Only a steward **destroys** —
  removes a document or deletes a version for good — because nothing brings
  those back.

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
  different email address fails. The invited role is validated against the two
  real roles — an invitation naming `owner` is rejected, because owner is a flag
  and moving it is a separate, deliberate act.
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
  something to look at" plus a link. A notification email is a subject line, one
  sentence naming the kind of event and the community, a link to the subject and
  a link to the member's email settings; not a title, not a name, not who acted.
  The functions that compose them (`mail/messages.ts`, `jobs/digest.ts`) take no
  parameter governance text could arrive through. Whether to send is decided
  when the job runs, not when it was queued: an ended membership, email turned
  off, an unverified or erased address, or a suspended community sends nothing,
  and a subject the recipient can no longer see is not mailed.
- **Removal is the one email to somebody who is no longer a member**, because
  they can no longer open an in-app notification. It names the community and
  nothing else — not who removed them, not why — and an erasure that ends
  memberships sends none.
- **Notifications are marked read only by a POST** (`/c/[slug]/notifications`,
  `open` and `readAll`). A GET that marked and redirected would be triggered by
  link preloading, browsers and mail scanners, reading a member's notifications
  for them. Email links go straight to the subject and mark nothing.
- **Who may receive a notification is decided in `notify`, once**: recipients are
  filtered to current memberships of the acting community, whatever the caller
  passed, so a membership of another community or one that has ended gets
  nothing.
- **A notification about something a member may no longer see carries nothing
  of it.** Subjects are checked through `visibleTo` when the list is read (one
  query per subject type); a restricted, removed or foreign subject is shown as
  "No longer available" with no title, filename or actor.
- **The public surface is the only anonymous read path**, and it has two gates:
  the community's `public_index_enabled` switch and the subject's visibility.
  With the switch off every public URL is 404 regardless of what is `world`. It
  is rate-limited by the ordinary per-address bucket rather than one of its own,
  and `robots.txt` allows `/p/` while refusing every authenticated route — a
  courtesy to crawlers, not a control, since those routes refuse anonymous
  requests anyway.
- **A withdrawn page must stop being readable immediately**, so public artifact
  pages are `max-age=0, must-revalidate` rather than cached for minutes. A
  community usually withdraws something because it should not have been there,
  and a five-minute cache — in a browser or a CDN — is five minutes of it still
  being served. Found by the exit spec, which navigated twice and got the cached
  200 the second time.
- **The compliance percentage cannot reach it.** Structurally, not by rule: the
  outward claim is its own type with no field a percentage could be computed
  from, so a summary card added later cannot render one by accident. `docs/03`'s
  `ArtifactProgress` carries `authored` and `answered` and deliberately does not
  appear on that path.
- **A name is published only where that person consented**, checked before the
  community's attribution policy rather than after — both orders agree today,
  and only this one still agrees when somebody adds a third policy. A name on the
  open web is the one thing in this phase that cannot be walked back.
- **The mirror credential is the first secret held on somebody else's behalf.**
  AES-256-GCM under a key derived from `BETTER_AUTH_SECRET` through HKDF with its
  own label; write-only from the interface; and redacted out of failure reports,
  because git prints the whole remote URL — token included — in its error output.
  The rethrow carries no `cause` for the same reason.
- **Risk-profile answers never leave the community.** The five interview
  questions (`risk_profile`) ask whether a community holds land, holds money
  together, has children living on site, has one owner or a founder's veto, and
  whether it meets in person. Those are facts about *people*, not about
  governance: they order a list and do nothing else. They are never sent to a
  model, never on a public surface, and never in an export the community did not
  ask for.

  Proved twice, because "we do not send it" is a claim about an absence. The AI
  module cannot import `db/schema/path.ts` at any depth — the same
  `no-restricted-imports` boundary that keeps it away from every other content
  table — and `tests/integration/risk-profile.test.ts` runs both real AI tasks
  against a recording provider for a community with a full profile and one
  without, asserting the requests are byte-identical. Asserting some particular
  word is absent would only catch the leak somebody thought of.

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
| Extraction wall-clock | 120 s in a worker thread that is **terminated** at the deadline, then failed with a message — a `Promise.race` cannot stop a parser that never yields | `EXTRACT_TIMEOUT_S` |
| Extraction heap | 512 MB for the worker thread; exhaustion fails the document, not the job runner | `EXTRACT_MAX_HEAP_MB` |
| Request body | Must be at least `MAX_UPLOAD_MB` + 1 MB; adapter-node's default (512 KB) refused every real upload before the application saw it, so boot fails in production when they disagree | `BODY_SIZE_LIMIT` |
| **Per user** | 20 uploads/hour (a replacement counts as one), 40/day | `UPLOAD_PER_USER_HOUR`, `_DAY` |
| **Per community** | 60 uploads/day, 2 GB stored | `UPLOAD_PER_COMMUNITY_DAY`, `STORAGE_MB` |

**A zip bomb is not caught by sniffing, and cannot be.** A bomb built inside a
`.docx` *is* a `.docx`, structurally, and the format check accepts it correctly.
What refuses it is a different question asked of a different part of the file:
the archive's own central directory records what each entry decompresses to, so
the answer costs a few kilobytes of reading and nothing is unpacked to discover
that unpacking it would be a bad idea. This was found by the test, not by the
design — the first version of the upload envelope believed sniffing covered it.

Rejected outright: anything executable or archive-shaped (`.zip .exe .js .html
.svg`), files whose sniffed type contradicts the extension, encrypted PDFs, and
PDFs with no text layer — the last of these is *accepted as a file* but reported
as *"this looks like a scan, Compass cannot read it"* rather than extracting zero
passages silently.

`.odt` is on the list because the RCOS templates are published in it — a
community that downloaded the templates and filled them in should be able to
upload exactly what they have.

**Reading `.odt` is ours.** No maintained, correctly-licensed reader exists on
npm, and the format matters too much to drop: it is what the templates come in.
An `.odt` is a zip with one XML file that counts, so the reader unzips
`content.xml` under the same decompressed-size ceiling `.docx` uses and reads the
text nodes. It refuses any document carrying a `DOCTYPE` outright rather than
configuring entity expansion off — there is no DTD processing to switch off, no
entities beyond the five the XML spec predefines plus numeric references, and the
only reason for a DOCTYPE in a `content.xml` is to be a bomb. A billion-laughs
fixture proves it, and the attack costs a regex over four hundred bytes.

Storage limits are technically enforced but set high during the testing phase
(`10-legal-and-operations.md` §4); they exist to stop a runaway loop, not to
ration.

### 5.2 Handling

- **Type and size** as above, checked before a byte is written to disk.
  Parsing happens in a worker with a wall-clock timeout and a memory ceiling.
- **No remote fetch of documents by URL** in MVP — that is an SSRF surface with
  no product value yet.
- **Prompt injection**: extracted text is passed to the model inside a delimited
  data block with a system prompt that states it is data, never instructions. The
  delimiters are stripped from the text first, so a document cannot close the
  block and write outside it. But the real defence is structural: **an AI response
  can only produce a suggestion row**.

  Since P4 that is enforced by the import graph rather than by review. Nothing
  under `src/lib/server/ai/` may import a service that writes or any schema module
  but its own log — a rule with tests in both directions, at both nesting depths.
  The depth matters: the first version of the rule matched `../services/*` and
  silently permitted `../../services/*`, which is how a task in a subdirectory
  would have reached everything. A boundary with a hole in it is worse than none,
  because it gets trusted.

  The second half is that a model never sees an identifier from our database. It
  is given numbered passages and clause references, and the numbers are resolved
  back here; anything it names that we did not send is discarded. A pairing it
  invents has nothing to attach to. There is no code path from a model output to an adopted definition, a
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
| Document mapping | the expensive one: started by a member with the paragraph estimate shown first, twelve paragraphs a batch, capped by `MAX_EXTRACT_PAGES`, resumable, never paying for a paragraph twice, and each batch charged to the member who started or continued the scan | — |

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
- **`worker-src 'self'`** is the one directive the original PDF view added:
  under `'strict-dynamic'` browsers ignore `'self'` in `script-src`, and
  `worker-src` falls back to it, so a same-origin worker was otherwise refused.
  `script-src` gained nothing — no `unsafe-*`, no `wasm-unsafe-eval`, no host —
  and `tests/unit/security-headers.test.ts` holds it there.
- **Rendering an uploaded PDF in the browser.** The file still comes from the
  member-only route as an attachment; pdf.js draws it in the member's tab with
  XFA off, no scripting (`pdf.sandbox` is never loaded), no annotation layer (a
  document can't give a member a link or a form), no WebAssembly, a 16 MP cap on
  decoded images and on each canvas, and only nearby pages drawn. The version is
  pinned exactly and upgraded by deliberate PR. An e2e fixture carrying a
  document-level script, an external link annotation and a broken font fails
  the suite on any CSP violation, dialog or navigation.
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

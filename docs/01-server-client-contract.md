---
status: draft for discussion
version: 0.1
date: 2026-08-31
---

# Server ⇄ Client Communication — guidelines

How data moves between the SvelteKit server and the browser. These are
guidelines, not laws — but a deviation belongs in the PR description with a
reason, and the reviewer's default answer is "use the boring path".

---

## 1. The default path

**Reads → server `load`. Writes → form actions. Nothing else, unless §2 applies.**

```
+page.server.ts   load()      → data for the page, already authorised, already shaped
                  actions.x() → one write, validated, returns fail() or redirect/data
+page.svelte      <form method="POST" action="?/x" use:enhance>
```

Why this and not a client-side fetch layer: the page renders with data on the
first byte, works without JS, needs no client cache, and puts authorisation on
the server where a mistake is visible in one place.

### Rules for `load`

- **`+page.server.ts` only.** A universal `+page.ts` load is allowed only for
  data that is anonymous, cacheable, and identical for every viewer (the public
  artifact index, the standard browser's clause text). Anything member-scoped is
  server-only.
- **Return exactly what the page renders.** No "return the whole community and
  let the component pick". Over-fetching is how restricted content leaks into a
  payload a curious member can read in devtools — the serialised `data` is
  visible to the client even if the component never renders it.
- **Authorise inside load, not in the component.** Every server load and action
  starts with a `requirePermission(ctx, '…')` call. There is a test that fails if
  a server file under `(app)` or `(admin)` has no permission call (`06-testing-strategy.md` §6.2).
- **Slow panels stream.** Return a promise (AI linter results, document
  extraction progress) and `{#await}` it, rather than blocking the page.
- **Parent data flows down.** `layout.server.ts` loads community + membership +
  readiness once; pages call `await parent()` instead of re-querying.

### Rules for actions

- **One action = one intent**, named for the intent (`?/freeze`, `?/proposeChange`,
  `?/confirmMapping`), never `?/save` with a mode flag.
- **Validate with a valibot schema** exported from `src/lib/shared/schemas` so the
  same schema types the client-side hints and the tests.
- **Never trust identity or tenancy from the form.** `communityId`, `userId`,
  `role`, `authorId` come from `locals`. If the form must name a target
  (`definitionId`), the service re-checks that the target belongs to the resolved
  community before touching it.
- **Return `fail(400, { form, errors })`** with field-level errors; on success
  either return data or `redirect(303, …)` after a state change so a refresh
  doesn't re-post.
- **Mutating actions that create a permanent record take an idempotency key** —
  a hidden field generated when the form renders. Freeze is the case that matters:
  two people hitting Freeze on the same proposal must produce one decision, not
  two. The key is stored with the decision and a duplicate returns the existing one.
- **Concurrent editing is handled, not ignored.** A definition has one live
  draft. It autosaves on a 2s debounce, and every save carries the `edit_token`
  it was loaded with. A stale token does not overwrite: the second editor is
  shown who else is editing, what changed, and is offered *keep mine / take
  theirs / merge by hand*. Silent last-write-wins on governance text is the kind
  of bug a community notices only after it has quoted the wrong version.
- **`use:enhance` for progressive enhancement**, with a pending state on the
  submit button. Never disable the form without a visible spinner.

---

## 2. When a `+server.ts` endpoint is correct

Only these. Anything else is a `load` or an action.

| Case | Endpoint | Notes |
|---|---|---|
| File upload | `POST /c/[slug]/documents/upload` | streamed to disk, size-capped, type-sniffed |
| File download | `GET /c/[slug]/documents/[id]/file` | authorised per request, `Content-Disposition: attachment`, never a public path |
| Export bundle | `GET /c/[slug]/export/[jobId]` | signed, expiring, one-time |
| AI streaming | `POST /c/[slug]/ai/[task]` (SSE) | the only streaming surface; still server-side provider call |
| Incremental search | `GET /c/[slug]/search?q=` | typeahead for the global search and reverse lookup |
| Public JSON | `GET /c/[slug]/public/index.json` | anonymous, cache-friendly, no member names (see 04-security.md §4) |
| Webhooks / auth | `/api/auth/*` | better-auth's own handler |
| Health | `/healthz` | no auth, no tenant, no data |

Every endpoint: same `requirePermission` call, same valibot parse of query/body,
explicit `Content-Type`, and no stack traces in the response body.

---

## 3. What the client is allowed to do on its own

- **Ephemeral UI state** — open/closed panels, filter selections, drag order
  before publish, unsent draft text. `$state` in a component, or `sessionStorage`
  for the one or two things worth surviving a reload. Never a global store.
- **Optimistic updates** only for cheap, reversible toggles (marking a
  notification read, expanding a row). Never for anything that produces a
  decision, a version, or a mapping — those wait for the server.
- **Refresh** via `invalidate('community:readiness')` with matching `depends()`
  in load, not by re-fetching URLs by hand.
- **Polling**: on window focus, at most once per 30s, only on the Discussions
  and Dashboard pages. No background polling loops. (Realtime is post-MVP; see §6.)

The client never: computes readiness or compliance, decides permissions, holds an
API key, or constructs an AI prompt.

---

## 4. Errors

- Expected, recoverable → `fail()` with typed field errors, rendered in place.
- Not authorised → `error(404)` for a resource in another tenant, `error(403)`
  for a resource in this tenant the member may not touch. Never leak existence
  across tenant boundaries.
- Unexpected → `handleError` in `hooks.server.ts` logs with the request id and
  returns a generic message plus that id. No exception text, no stack, no SQL.
- Every error page keeps the app shell so a member can navigate away.

---

## 5. Cross-cutting concerns live in `hooks.server.ts`

In order: request id → security headers (CSP with nonce, `X-Frame-Options`,
`Referrer-Policy: same-origin`, HSTS in prod) → session resolution → rate limit →
tenant resolution → route.

Rate limits (per user, then per IP, sliding window in SQLite):
auth attempts 10/15min, AI tasks 30/hour/community, uploads 20/hour/community,
export 3/day/community, everything else 300/min.

---

## 6. Explicitly post-MVP

- SSE or WebSocket live updates on discussion threads. MVP polls on focus.
- A public, documented REST/JSON API for third parties.
- Any offline write path. Tauri, when it comes, talks to the same server over
  the same routes — which is exactly why §2 of `00-architecture.md` keeps the
  logic in services.

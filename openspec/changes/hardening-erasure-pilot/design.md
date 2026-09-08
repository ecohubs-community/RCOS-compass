## Context

P1–P6 built a product that holds a community's governance. P7 is the phase where
somebody outside the team has to be able to trust it: a person who wants to be
forgotten, a community deciding whether to adopt it, an operator answering "is
anything broken", and a member who navigates by keyboard.

Four constraints shape everything below.

**The register is append-only and erasure is a right.** `docs/03-data-model.md`
§10 already decided how they coexist — references are to `membership_id`, the
profile becomes a tombstone, attributions render as *"Former member (M-0142)"*,
and free text is corrected rather than rewritten. What did not exist until now is
any of the code. The design's job is to make that position true rather than
stated.

**Names are everywhere.** Six phases produced perhaps twenty surfaces that render
a person: the register, decision detail, attendees, discussions, documents, the
audit trail, notifications, members, exports, the mirror, the public pages. A
change that fixes nineteen of them is a leak in the twentieth.

**The pilot has two communities and one operator.** That rules out infrastructure
whose value appears at scale — an error tracker, a metrics stack, a queue
dashboard — and rules *in* the things that fail quietly at any size: a restore
nobody has run, a policy nobody has read, a keyboard trap nobody has hit.

**The legal documents are not ours to bless.** They can be written from the code
— that is the only way they are accurate — but nothing in this repository can
make them reviewed.

## Goals / Non-Goals

**Goals:**

- A person can ask to be erased and the product can carry it out, completely,
  without editing one governance record.
- One place decides how a person is rendered, and a surface that does not use it
  fails the suite.
- A community can read what happens to its data, in the product, before it
  agrees to anything.
- An operator can answer "is anything broken right now" from one page, and "can I
  get this back" from a drill that has actually run.
- WCAG 2.1 AA is a property the suite holds, at 375px as well as 1440px, by
  keyboard as well as by mouse.
- Feedback from the pilot arrives in a shape that becomes an OpenSpec proposal.

**Non-Goals:**

- **A DPA, or general availability terms.** `docs/10` §6 dates those to a legal
  entity and a lawyer. This phase produces pilot terms and marks them as such.
- **Deleting a community's governance on request.** Export and community deletion
  already exist; erasing a *person* is a different act and the only one here.
- **A metrics or tracing stack.** Structured logs, an error table and seven
  counters. `docs/00` §12 is explicit that anything more is a privacy decision
  taken by accident.
- **Impersonation for support.** `docs/05` §4 refuses it in MVP and a pilot is
  exactly when somebody will ask for it.
- **Fixing the 241 untranslated literals.** The P6 ratchet holds them; a phase
  that quietly absorbs another phase's backlog is how estimates stop meaning
  anything.
- **Seeding the pilot communities.** An operational act, prepared for here.

## Decisions

### 1. Erasure tombstones the person; the membership is what survives

`user` gains `erased_at` and `erased_by`. The row stays: sessions, accounts and
verification tokens are deleted, `name` becomes empty, `email` becomes a
non-routable placeholder derived from the user id, `image` is dropped. Every
foreign key in the product already points at `membership.id` or `user.id`, and
neither moves.

The alternative — deleting the `user` row and letting `on delete set null`
scatter — was rejected for one reason: `decision_attendee.membership_id` is what
proves eleven people were present. A null there does not say "somebody who has
since been erased"; it says nothing, and a tally that silently loses a row is a
falsified record.

**Nothing is retained about the address.** Not the email, not a hash of it. A
salted hash of an email is recoverable by anybody who can guess the address,
which is exactly the person the erasure was requested against; keeping one so
that a later re-registration could be recognised would trade the whole point of
the act for an operational convenience nobody asked for. A person who signs up
again is a new person, and the product has no way to know otherwise. That is the
correct answer, not a limitation.

### 2. `M-0142` is assigned when somebody joins, not when they are erased

`membership` gains `seq`, unique per community, allocated `max + 1` exactly as
`decision.seq` is, and never reused. The label is `M-` plus four zero-padded
digits.

Minting it at erasure was the obvious shortcut and is wrong twice. A label
created at erasure is a *new fact appearing inside old records* — the register
would show a reference that did not exist when the decision was frozen. And two
erasures in the same community racing for `max + 1` would collide precisely when
nobody is watching. Assigning at join makes the label a property of the
membership, stable from the first day, printable in the member list, and
completely uninteresting until the day it is needed.

The migration backfills existing memberships ordered by `joined_at`, so the
oldest member of each community is `M-0001`.

### 3. One function renders a person, and a registry test enumerates the callers

```ts
personLabel(row: { erasedAt: Date | null; name: string; displayName: string | null; seq: number })
```

Every surface goes through it. `tests/support/person-surfaces.ts` lists each
service that returns a person's name, with a factory that erases the person and
asserts the output — the same mechanism the P6 read-path registry used, for the
same reason: a service added in P8 that renders a name and is not listed fails
the suite rather than being covered by nobody remembering.

Considered and rejected: a database view, or a `render` at the component layer.
The view cannot reach the JSON payloads in the audit trail and the notifications;
the component layer is too late, because the name has already crossed into an
export, a mirror commit and a page's serialised `data` by then. The label is
produced where the row is read.

### 3b. On a platform surface an erased person has no community, and so no label

`M-0142` is a number inside one community. The admin audit trail is
platform-wide: an event carries an actor id and sometimes a community, and a
sign-in failure carries neither. So the rule has two halves — where a community
is in scope the label is that community's, and where none is, an erased person
renders as *"Erased account"* with no number at all.

Inventing a global number instead was considered and rejected: a
platform-wide identifier for a person who asked to be forgotten is precisely the
thing that lets two communities' records be joined together, which is what
scoping the label to a community avoids in the first place.

### 3a. Six places already hold a name that `personLabel` cannot reach

Reviewing the design against the schema found four denormalised copies. A
rendering function fixes the surfaces that read a row; it does nothing for a name
that was *copied* somewhere at the time it was written. Each needs its own answer:

- **`audit_event.actor_email`** — kept, by a comment that says "so the trail
  survives the actor's deletion". That reasoning is now inverted: the trail
  survives because the `user` row survives as a tombstone, and the column is the
  one place an erased address would remain. Erasure clears it on that person's
  events, and the comment is corrected to say so.
- **`invitation.email`** — a pending invitation to the erased address is a
  standing copy of it and a live route back in. Erasure revokes every open
  invitation to that address.
- **`decision_attendee.external_name`** — a facilitator or a neighbour who was
  present, typed in by whoever froze the decision. They have no account and no
  way to ask us for anything, which makes this the most exposed personal data in
  the product. It is named in the inventory, `personLabel` renders it as a
  present non-member, and a redaction can replace it on request from the person
  named.
- **`membership.display_name`** — the name a person chose to be known by in one
  community. `personLabel` checks `erased_at` first so it never renders, but the
  row would keep it, which is holding a name after being asked not to. Erasure
  clears it.
- **`rate_limit_bucket.key`** — carries the client address inside strings like
  `login:ip:203.0.113.4`. Not erasure's business, because it is not keyed to a
  person, but it is personal data with a natural expiry and it belongs in the
  inventory rather than being noticed by somebody else later.
- **Git commit bodies** — see decision 4a.

The check that keeps this list honest is the inventory test in decision 6:
a column holding a name or an address that nobody has written down is a failure,
not an oversight.

### 4. A correction is a new version; a redaction is a recorded overwrite

`docs/03` §10's correction flow covers the ordinary case: a definition body that
was wrong gets a new version, and history keeps the old one. That is
append-only, and it is right.

It does not, on its own, satisfy an erasure request. A name inside a superseded
version is still a name we hold. So there are two operations and they are not
the same:

- **Correction** — a new version supersedes the old one, with a reason. Nothing
  is destroyed. Any member with the permission to edit may do it.
- **Redaction** — the named span inside a stored body is replaced with
  `[redacted at the request of the person named]`. Steward-only, permitted only
  while an erasure is being carried out or on a documented request from the
  person named, and recorded in the change log as *that a redaction happened* —
  never what was removed, because a change log that quotes the redacted text is
  the leak with extra steps.

Redaction may touch any body a member wrote: a definition version's body, a
decision's rationale and proposal text, a discussion post, an objection's reason
and an external attendee's name. Scoping it to definitions and decisions was the
first draft and was too narrow — `docs/03` §10 says *free-text bodies*, and the
place a member is most likely to type somebody's name is a discussion, not an
adopted rule. It may not touch the decision's structure — the ref, the date, the
mechanism, the tally, the attendance rows themselves. What was decided survives; who was named
inside the prose does not have to.

**A redaction reindexes, in the same transaction.** The search index holds its
own copy of the body — that is what makes search fast and what would otherwise
keep the redacted name findable through a search box after it had gone from the
page. P6 established that a visibility change reindexes inside the transaction
that makes it; a body change is the same rule, and leaving it out would have been
a name still reachable by anybody who typed it.

The trade-off is real and stated in the policy: redaction edits a stored row, so
a community that has already exported or mirrored that text holds a copy we
cannot reach. The mirror is re-committed after a redaction so the *current* state
is clean, and the git history is not rewritten, because rewriting a community's
repository is not ours to do.

### 4a. The mirror stops writing people's names into commit bodies

P6 put the person who froze a decision in the commit body — *"Recorded by Ana in
Valle Verde"* — deliberately, to keep their email out of the git author field,
which was the right half of the problem. The other half only becomes visible from
here: a commit body is history in a repository the community controls and may
have pushed to a public remote, and this design has just committed to not
rewriting it. So an erasure cannot reach a name that P6 wrote there.

Going forward the body names the membership label — *"Recorded by M-0142 in Valle
Verde"* — which is stable, community-local, and already what the register renders
after an erasure. Commits already made keep the name, the privacy policy says so
in the same paragraph that says an exported bundle cannot be recalled, and a
community that wants those commits gone rewrites its own repository, which is a
thing only it can decide to do.

This is a P6 defect found by specifying P7, and it is worth naming as one: the
mirror's own reasoning about the author field stopped one step short of the
message body.

### 5. The legal text lives in git; the review lives in the database

Three Markdown files under `content/legal/` — `privacy.md`, `pilot-terms.md`,
`sub-processors.md` — served at `/privacy`, `/terms` and `/sub-processors`. The
review state is a `legal_review` row per document naming the version by
**content hash**, who marked it reviewed, and when.

This splits the two things cleanly. The text belongs in git, where it is diffed,
reviewed in a commit and deployed atomically with the code whose behaviour it
describes. The acknowledgement is an operational fact about one exact wording,
so it is keyed to the hash: editing a file re-arms the *draft — not yet reviewed
by counsel* banner automatically, which is the property that matters. A database
copy of the text would let the policy drift from the code that implements it, and
a git-only marker would let a one-word edit slip through a past review.

### 5a. The legal text is imported, not read from disk at runtime

The three Markdown files are pulled in with Vite's `?raw` import, so they are
bundled with the code they describe and the content hash is computed from what
actually shipped. Reading them from `content/legal/` at runtime would be the
obvious approach and would break the moment the application is deployed as a
built bundle, because nothing copies arbitrary directories into the output — a
failure that appears in production and never in development.

### 6. The privacy policy is generated from a data inventory, not from memory

`docs/13-data-inventory.md` — new — lists every table holding personal data, what
is in it, why, how long it stays and what erasure does to it. The privacy policy
is written from it and a test asserts that every table in the schema whose
columns include a person's name, email or IP appears in the inventory.

Without that check the inventory is accurate on the day it is written. With it, a
table added in P8 that holds an address fails the suite until somebody says what
it is for.

### 6a. What the status page can honestly report about AI, and about mail

Two of the panels `docs/05` §3.5 asks for do not have data behind them, and
saying so is cheaper than inventing it.

**"AI spend this month across tenants."** `ai_call` records tokens in, tokens out
and duration — no price. Turning that into currency needs a price list per model
that nothing maintains, and a page reporting money computed from a stale table is
worse than one reporting tokens. The panel shows calls and tokens per month,
per community, and shows cost only where a price list is configured. If a price
list is ever added, the panel gains a column rather than changing meaning.

**"Mail delivery failures."** Nothing records them today: `getMailTransport`
throws when unconfigured and the caller reports it, and a send that fails after
that is a rejected promise nobody stores. A failure now writes a row carrying the
message kind, the community, the invitation or membership it was for, and the
error — **never the recipient address**, which would put an address into a table
built to make operational problems visible.

### 7. Errors are recorded here, grouped, and scrubbed by the same code as the logs

`error_report` carries a fingerprint (error name plus the top frames of the
stack, hashed), the scrubbed message, the route, the request id, the community,
first and last seen, and a count. `hooks.server.ts`'s existing `handleError`
writes it; the visitor's response does not change.

Grouping by fingerprint is what keeps the page readable: one broken route
generating four hundred rows is one row that says four hundred. Scrubbing goes
through the logger's redaction module rather than a second copy of the rules,
so an error record and a log line cannot disagree about what is safe to keep.
Definition bodies, discussion text and document contents never appear, which
means the message is stored but never the values interpolated into it.

Retention is 30 days, swept by the existing cleanup job pattern. A Sentry DSN
stays possible later; it is not a dependency this pilot needs, and adding one
would lengthen the sub-processor list this same phase publishes.

### 8. Seven counters, per community, written once

`funnel_event(community_id, kind, at)` with a unique index on
`(community_id, kind)`. The seven kinds from `docs/00` §12 are milestones, not
volumes: a community reaches "first definition adopted" once. Writing is
`insert … on conflict do nothing` at the point the thing happens, inside the
transaction that makes it true.

`/admin/status` shows how many communities reached each step. There is no
per-member row, no session, no path, and nothing a person could be identified
from. `PRODUCT_ANALYTICS=off` skips the writes entirely for a self-hosted
instance, per §12's own escape hatch.

### 9. The snapshot takes the uploads with the database, and the drill is a test

`pnpm snapshot [dir]` writes `db.sqlite` via `VACUUM INTO` plus a copy of the
upload tree into one timestamped directory; `pnpm restore <dir>` puts both back
and refuses to run against a database that is currently open by a server.

The drill is an integration test, not a runbook step: it seeds a community with a
document and a mapped passage, snapshots, restores into a scratch directory,
opens the restored database and asserts the passage reads back and its file is on
disk. `docs/00` §9 already states the criterion in those words — "restores both
and re-opens a mapped document" — and a criterion in a document is a criterion
nobody has run.

### 10. Accessibility gets a route registry and a 375px project

Three additions, all mechanical:

- A `mobile-small` Playwright project at 375×667, **scoped to the core-loop and
  a11y specs** rather than the whole suite: a fifth project running all 250 tests
  would add minutes to every run to re-prove things that are not viewport
  dependent. `Pixel 7` is 412px wide, so "the loop at 375px" has never actually
  run.
- `tests/support/routes.ts` enumerates the route files on disk. The a11y spec
  asserts every route is either scanned or listed as exempt with a reason, so a
  screen added in P8 cannot quietly go unscanned.
- Focus moves to the page's `h1` after navigation, and every route is walked by
  keyboard asserting each interactive element is reachable and has a visible
  focus ring.

The muted-contrast finding (spec-review row 32) was already resolved in `app.css`
— `#7c8685` at 5.1:1. What was never done is the *check*: a token test asserting
every foreground/background pair in the token file clears AA at its intended
size, so the next person to adjust a colour finds out immediately.

### 11. Feedback is a report about a screen, not a message about a person

`feedback_report` carries the community, the membership, the route, a kind
(confusing / broken / missing / other) and the member's own words. It does not
capture page content, form values, or a screenshot: a bug report that scoops up
the definition somebody was drafting is a governance leak wearing a helpful hat.

Stewards see their community's reports; a platform admin sees all of them and can
export the open ones as Markdown with the route and the kind as a heading — the
shape an OpenSpec proposal starts from. Erasure applies here like everywhere:
a report by an erased member renders as `Former member (M-0142)` and its text is
subject to redaction like any other free text.

### 12. Licence lines come from the standard's own metadata

`meta.yaml` already carries `licence`, `attribution` and `source`, and nothing has
ever printed them. The export's README and manifest, the public page footer and
the application footer render those fields rather than a string typed into a
component — so a standard published under different terms carries its own terms,
and PolyForm NC is named for the application beside it.

Spec-review row 19 dated this to P1. It is four lines of rendering and one test;
the reason it is here is that nobody noticed until the export existed to put it
in.

## Risks / Trade-offs

**Erasure misses a surface** → The registry test is the mitigation, and it is
only as good as its list. Backstop: a test that walks every service export
returning a shape with a `name` field and fails if the service is unlisted, so
the list is checked against the code rather than against memory.

**Redaction is destructive and steward-triggered** → A steward could redact
something inconvenient rather than something personal. Mitigations: it is
recorded in the change log with an actor, it cannot touch a decision's structure
or tally, and the redaction marker is visible in the text where the span was, so
a reader sees that something was removed. A community that abuses it is visible
to its own members, which is the only enforcement this product has anywhere.

**A community exported or mirrored text before a redaction** → Unreachable, and
the policy says so plainly rather than implying we can recall a bundle. The
mirror is re-committed so its current state is clean.

**The legal documents are drafts that read like policy** → The banner is rendered
from the review state, not typed into the file, so it cannot be forgotten; and
the pilot task list puts marking them reviewed before seeding a real community.

**The funnel counters drift into behavioural analytics** → The schema prevents
it: one row per community per milestone, no timestamp granularity beyond the
event, no member id, no path. Adding a member id would be a schema change and a
review, which is the point.

**375px reveals genuine layout problems late** → Likely, and better now than
during onboarding. The tables in the register and the path are the known risk;
they already scroll inside `overflow-x` containers, which is the pattern the
component guidelines set.

**Every screen this phase adds must use message functions** → The P6 i18n
ratchet fails when the count of untranslated literals grows, and this phase adds
the legal pages, the account screen, the feedback control and three admin
panels. Writing them with `m.*` from the start is cheaper than extracting them
after the ratchet goes red, which is exactly what the ratchet exists to make
somebody notice.

**The application has no footer to put the legal links in** → Only the public
group has one. The links need a shell-level footer on the authenticated layout
too, which is a small piece of layout work that the phase would otherwise
discover at the end of a task that assumed it existed.

**The restore drill is slow and gets skipped** → It runs in the integration suite
against a temporary directory, not against a real backup target, so it is
seconds. The real quarterly drill against production remains an operational act
the runbook describes.

## Migration Plan

One additive migration: `user.erased_at`, `user.erased_by`, `membership.seq`
(backfilled by `joined_at` per community, then a unique index), `error_report`,
`funnel_event`, `legal_review`, `feedback_report`.

The backfill is the only part that touches existing rows, and it writes a column
that did not exist. A deployment that fails after it is applied leaves
memberships carrying a sequence nothing reads yet.

Deploy order is migrate → serve, unchanged. No rebuild step this time: nothing
in the search index changes.

Rollback: the migration is additive, so a previous build runs against the new
schema. An erasure already carried out cannot be rolled back, by construction —
which is stated here so it is a decision rather than a discovery.

## Open Questions

- **Does a pilot community get to see its own error reports?** Currently no —
  `/admin/status` is platform-admin only, and an error message can carry a route
  and an id. A steward seeing "something failed at 14:02" might reduce support
  round-trips. Left out until somebody asks.
- **What happens when the last platform admin erases themselves?** The design
  refuses it, on the same reasoning as the sole owner: an instance with no
  administrator cannot restore itself. Whether the refusal should instead be a
  warning is a question for whoever runs more than one instance.
- **What happens to a community whose owner erases themselves?** The design
  refuses it while they are the only owner and asks them to transfer first. A
  community with exactly one member who wants to be erased has no one to transfer
  to; the answer is probably to delete the community, and the flow for "erase me
  and the community I am alone in" is not built.
- **How long may an audit event keep an IP address?** `audit_event` carries `ip`
  and `user_agent` on every security-relevant act, with no retention rule
  anywhere. The inventory forces the question and this phase must answer it in
  writing; whether the answer is also enforced by a sweep is scope this design
  leaves open, because the trail is the security record and shortening it is a
  security decision as much as a privacy one.
- **How long should feedback reports live?** They are a member's own words, so
  they are personal data with no retention rule yet. Thirty days after being
  marked handled is the working answer; the inventory records it either way.

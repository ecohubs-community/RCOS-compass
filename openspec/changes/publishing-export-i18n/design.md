## Context

Every read path in P1–P5 was written against a single audience: an authenticated
member of one community. That was correct then and it is the constraint this
phase removes, in three directions at once — a world that is not signed in, a
file that leaves the server, and a repository that is not ours.

Three things shape the work.

**A filter added late is a filter that gets missed.** `visibility` appears in
`docs/03` §9, `docs/04` §4 and UI spec §1.6, and in no query. Adding it means
touching every list service written so far, and a list that quietly returns fewer
rows is not a failing test unless something counts. The enumerating test comes
before the filter, not after it, for the same reason the cross-tenant suite is
parameterised over a registry: forgetting has to be impossible rather than
unlikely.

**The percentage escaping is the one irreversible failure.** UI spec §1.4 is
blunt about why: if "73% compliant" reaches community websites, the word
compliant stops meaning anything and the standard loses its only enforcement
mechanism. Everything else in this phase can be fixed in the next release. That
one cannot, because it is other people's screenshots.

**This phase holds the first secret on a community's behalf.** A git remote's
token is not our credential to lose. It changes what a database file is worth to
an attacker, and it is the first thing in Compass that has to be write-only from
the interface.

## Goals / Non-Goals

**Goals:**

- One filter, applied inside the query, that every read path uses and that a test
  proves every read path uses.
- Restriction that expires. A transparency exception with no end date is a
  permission setting wearing a justification.
- An anonymous public page carrying the binary claim, its gap list and the
  self-audit date — and structurally incapable of carrying a percentage.
- A bundle a community can open in five years with no Compass and no internet.
- Verifiable history for every community with no configuration, and a remote for
  those who want one.
- A German community reading a German interface, and knowing which words are
  still English.

**Non-Goals:**

- Public *search*. The index is a page per artifact and a list; indexing world
  content for anonymous full-text search is a second surface with its own leak
  shape, and nothing asks for it yet.
- Public comment, contact forms, or anything that accepts input from an anonymous
  visitor. The index is read-only; RCOS Appendix C.6's "contact or inquiry
  channel" is a mailto the community writes, not an inbox we run.
- Custom domains per community. Path-based tenancy (`/p/<slug>`) is what P6
  ships; a community wanting `governance.example.org` gets a CNAME story later.
- Translating a community's own definitions. Ever. They are legal text a group
  agreed on in their own words, and a machine translation of a governance rule is
  a different rule.
- Selective export ("just Layer 2"). One bundle, everything the requester may
  see. Choosing subsets is a feature; being able to leave is a promise.

## Decisions

### 1. `visibility` is a column, and the filter is in the query

Four tables gain `visibility text not null default 'member'` with a CHECK, and
one helper returns the drizzle condition. Every list, every detail read, the
search index write, the AI context assembly, the export and the mirror take it.

**The helper cannot take a `Ctx`.** `Ctx` is `{ user, community, membership, now }`
and an anonymous visitor has none of the first three, so `visibleTo(ctx)` — which
is how the first draft of this document put it — is a signature the public
surface can never satisfy. The parameter is an **audience**:

```
type Audience =
  | { kind: 'anonymous'; communityId: string }
  | { kind: 'member'; ctx: Ctx }
```

`visibleTo(audience)` returns `visibility = 'world'` for the first and the
member's own set for the second. This is not a detail. The alternative anybody
reaches for under time pressure is constructing a fake `Ctx` for the public
loader, and a fake `Ctx` satisfies `requirePermission(ctx, 'community.read')` —
which would hand an anonymous visitor every read path in the product. The type
has to make that unrepresentable, which means the public loaders never build a
`Ctx` and the services they call take an `Audience`.

*Why in the query rather than after:* the same reason the tenant boundary is
(P5, `docs/00` §5). A read that fetches everything and filters the result is one
refactor away from not filtering, and the failure is silent and in the worst
direction.

*Alternative considered:* a view per visibility level. Postgres would make that
attractive; SQLite views plus drizzle's typing would mean hand-written SQL in
exactly the place `docs/00` §5 says not to have it.

**The enumerating test.** `visibility.test.ts` walks the read services the way
`cross-tenant.test.ts` walks the registry: for each, seed one `member` row and
one `world` row, call as an anonymous reader, and assert only the `world` row
comes back. A service that is not listed fails the suite. That list is written in
the first task of the phase, against services that do not filter yet, so the
suite goes red before any of them are touched.

### 2. `restricted` is not a level anybody can set

The three levels are not symmetric, and treating them as a dropdown would lose
the point. `member` is the default. `world` requires a decision. `restricted`
requires an unexpired `transparency_exception` row, and **the service refuses to
write `restricted` without one** — the state and its justification are created in
the same transaction or neither is.

The exception carries: subject, justification, `expires_at`, the authorising
decision, who created it, and **who may see it**. That last field was missing
from the data-model sketch in `docs/03` §3 and is named explicitly in UI spec
§1.6; without it "restricted" has no defined audience and the requirement that a
member sees restricted subjects "only if they may" is unimplementable. For the
MVP the audience is a role — `steward` — rather than a member list: per-member
access control is a second permission system, and RCOS §5.3.5 asks for
justification and time-bounding, not for fine-grained ACLs.

A job reverts expired subjects to `member` and writes a change-log entry, so the
community sees restriction end rather than discovering it silently continued. It
re-arms itself the way `weekly-digest` does rather than introducing a scheduler —
the queue already has that pattern and a second one would be a second thing to
get wrong.

*Why an expiry is mandatory rather than optional:* RCOS §5.3.5 requires
exceptions to be time-bounded. An optional expiry becomes a null on every row
within a month, and the object stops being an exception and becomes a checkbox
with extra words.

### 3. Publishing is a decision, and unpublishing is a 410

Moving an artifact to `world` writes a decision record. It is a governance act
(UI spec §1.6) and the register is where governance acts live; a community that
later asks "when did we make this public, and who agreed?" gets an answer.

Unpublishing sets visibility back, **also writes a decision**, and the public
route answers **410 Gone**. Not 404, which says the page never existed and is a
lie somebody can check against their own bookmark; not a redirect, which pretends
nothing changed. 410 says: it was here, it isn't now, and this community decided
that.

*Unpublishing is a decision for the same reason publishing is.* Withdrawing
something a community made public is as much a governance act as making it
public, and a community that can quietly unpublish has a hole in the record
exactly where somebody will later ask a question.

**410 needs a source of truth, and visibility alone is not one.** A subject back
at `member` looks identical to one that was never published, so the route cannot
tell the two apart from the column. The subject carries `first_published_at`,
set once and never cleared: present means the page existed and 410 is the honest
answer; absent means 404. Reconstructing it by scanning the register for a
publishing decision would work and would put a query over the decision table on
every 404 of a public route, which is the shape of thing a crawler finds first.

*Trade-off:* 410 confirms the page once existed, which is a small disclosure. It
is the right one — the alternative is lying to someone holding a link the
community itself gave them.

### 4. The public index cannot render a percentage

Not "must not" — cannot. The public loader builds its own view model with no
readiness field on it, and the compliance service exposes two shapes: `readiness`
(percentage, per layer, inward) and `claim` (binary, gap list, audit date,
outward). The public route can only reach the second, because the first is not in
what it is given.

*Why structural rather than a rule:* "remember not to put the percentage on the
public page" is a rule that survives until someone adds a summary card. A field
that does not exist in the type cannot be rendered by accident, and the test that
crawls every public route asserting no `%` is then a second line of defence
rather than the only one.

### 4a. Two gates, not one: the community's switch and the artifact's visibility

`community.public_index_enabled` already exists and already defaults to false, and
the first draft of this proposal ignored it. It is not redundant with per-artifact
visibility: it answers "does this community have a public presence at all",
which is a different question from "is this artifact public". A community
mid-way through publishing its first artifact should not acquire a public URL as
a side effect of a visibility change.

So the public route requires both — the switch on, and the subject `world` — and
a community with the switch off answers 404 for every public URL regardless of
what is `world`. Turning the switch on is a steward act and, like publishing, a
recorded one.

*Why not drop the switch and let visibility alone decide:* because unpublishing
everything would then be the only way to withdraw a community's public presence,
and "we want to stop being public for a month while we sort something out" is a
thing communities will want that should not require unpublishing eleven
artifacts one at a time.

### 5. Attribution is `roles_and_counts` outward until a person says otherwise

`community.publish_names_policy` defaults to `roles_and_counts` — *"consent, 9 of
11 present"*. An individual name appears publicly only where that attendee has
`consented_to_publish`. Both already exist in the schema; this phase is the first
that reads them.

*Why the default sits where it does:* the mockup's "Attributed to the 11 people
present" is right inside a community and wrong outward, and the difference is
that the second is a permanent, indexable, screenshot-able record of who was in a
room. A community can choose otherwise per attendee. It cannot choose it for
somebody else in bulk.

### 6. Self-audit is a record, not a computation

Readiness is always live; the audit does not recompute anything. It writes an
immutable row containing what was true at that moment and who ran it. The public
index cites its date; previous audits stay listed so a community can see its own
trajectory.

*Why it is in this phase:* the public index is specified to carry
*"last self-audit 1 Aug 2026"*, and RCOS Appendix C.5 requires a date and a
method. Shipping the index without it means shipping the surface with a hole in
the exact place the standard says to look.

*Two things it deliberately is not* (UI spec §4.8): an approval — nobody is
certified by pressing a button — and an AI judgement. Every line is computed from
records, so two people running it get the same answer.

### 7. Export is a job, and the bundle is readable without us

Markdown for people, JSON for machines, PDF for the printer and the regulator.
One background job, one signed expiring link, one download.

The Markdown is the test of the whole thing: an artifact per file, a decision
register as a table, a manifest — and it has to make sense opened in any editor,
with no Compass and no internet. The e2e spec unzips the bundle and reads it
without the app running, because "exports" that only render inside the product
they came from are the shape of lock-in this promise exists to refuse.

PDF via headless Chromium against the app's own print stylesheet, already decided
in `docs/00` §8. It moves Playwright from a dev dependency to a runtime one on
the server, which is the cost; the alternative is a second layout engine and a
second set of bugs about it.

**Local definitions are in the bundle, labelled.** UI spec §4.8: leaving them out
makes the export a misrepresentation of how the community governs itself;
including them unlabelled lets an outsider read a house rule as a standard
requirement. An auditor must be able to tell at a glance, and so must a new
member.

### 7a. One artifact renderer, three consumers

The public artifact page, the export's Markdown and the mirror's commit are the
same operation — *render this artifact, with its adopted definitions, its local
additions and its provenance, as a document*. The first draft of this plan built
it three times, once per group, which is how the export ends up saying something
subtly different from the public page and both differ from what is in git.

So there is one renderer producing a structured document, and three thin
adapters: to HTML for the page, to Markdown for the bundle and the repository,
and to the print stylesheet for the PDF. A test renders one artifact through all
three and asserts the same facts appear in each.

*Why this matters more here than usual:* the self-audit exists so a community can
show an outsider what is true. Three renderings that disagree is precisely the
thing an auditor would find and precisely the thing the product cannot afford to
be caught doing.

### 7b. Two derived keys, and no new required configuration

The export links need signing and the mirror credential needs encrypting. Both
could be new required environment variables — and adding a required variable
means every existing deployment fails to boot until somebody sets it
(`docs/00` §10), for two features they may never use.

Instead both are **derived from `BETTER_AUTH_SECRET` with distinct domain
separators**, so there is one secret to rotate and no new way for a deployment to
be misconfigured. Rotating it invalidates outstanding export links, which is
correct — they are short-lived — and makes stored mirror credentials
undecryptable, which is not. So the credential row records which key generation
encrypted it and a rotation is a re-encrypt, not a silent breakage.

*Alternative considered:* separate secrets, which is better hygiene in the
abstract. Rejected because the concrete failure it prevents is theoretical and
the concrete failure it causes — a feature that silently does not work because a
variable is unset, or an instance that will not boot after an upgrade — is the
kind we have already met once in this project.

### 8. The mirror is one repository, and a remote is optional on top

Every community gets a local bare repository, with no configuration and no
decision to make: after each freeze, a job renders the adopted artifacts and the
decision record and commits them. A steward can download it as a git bundle at
any time. That is the whole durability promise, available to a community that has
never heard of GitHub and to one that does not trust it.

A community that wants its own remote links one. The same commits are then pushed
there. Linking changes where the repository is copied to, and nothing about what
is in it.

*Why this shape rather than either half alone:* a mirror that requires GitHub
excludes the communities most likely to want data sovereignty, and a mirror that
cannot leave the server is a backup we keep for them, which is not the promise.
Making the local repo primary also means the push path can fail forever without
anybody losing history.

**What is actually new.** `community` already carries `git_mirror_enabled`,
`public_index_enabled` and `publish_names_policy`; a `mirror_settings` table
would duplicate settings that exist. What has nowhere to live is the remote URL,
the encrypted credential and the last push's outcome, so that is what the new
table holds. Likewise there is no `export_job` table: the queue already stores a
job's kind, payload and status, and what is missing is a record of a *produced
file* — its path, its community, its expiry — which is the thing a later request
resolves and a cleanup job removes.

**The credential.** Encrypted at rest with a derived key (decision 7b), so a
stolen database file is not a set of working tokens. Write-only from the interface: a
steward enters or replaces it and can never read it back. Never in a log line, an
error body, an export, the admin console, or a push failure message. Revocation
is deleting the row, which stops pushes and keeps every commit.

*Alternative considered:* OAuth against GitHub, which avoids a stored long-lived
token. It is better security and it is GitHub-specific, and the point of this
feature is that a community can use any git remote — a Forgejo instance on their
own hardware included.

**The mirror respects visibility.** It is an outward path like any other, so it
carries `visibleTo`. Restricted content is excluded unless the community opts in
explicitly, and that opt-in is itself a setting a steward changes, not a flag on
the job.

### 9. Paraglide, and a fallback that shows

Compile-time message functions, no runtime bundle for locales nobody loaded, and
a missing key is a build error rather than a blank on a screen.

The interface ships English complete, German and Spanish translated. **A string
with no translation renders the English and marks it** — a small, non-decorative
indicator — rather than silently substituting. A silent fallback is how a
half-translated interface looks finished and stays half-translated for a year;
a visible one is a to-do list that maintains itself.

Standard content needs no work: the vendored data already carries all five
locales for every clause, section, artifact and glossary term, and
`localise()` already falls back and says so. A community's locale selects it.

*What is never translated:* a community's own definitions, decisions, rationales
and discussion posts. They are what a group agreed in their own words, and a
translated governance rule is a different rule.

### 10. The public surface is rate-limited and crawlable

It is the first thing in the product reachable without a session, which makes it
the first thing a crawler, a scraper or somebody bored finds. Public routes take
the existing per-IP limiter with their own ceiling — generous enough that a
search engine indexing a community is not throttled, tight enough that the
anonymous surface cannot be used to probe the app cheaply.

Crawlable on purpose: UI spec §4.8 calls communities publishing their governance
"free distribution" for RCOS, and a public index nobody can find is not
distribution. So `robots.txt` allows the public group and disallows everything
else, and each published community offers a sitemap. A community with the switch
off appears nowhere.

## Risks / Trade-offs

**A read path is missed and member content reaches the world** → The single
worst outcome in the phase. Three defences, deliberately overlapping: the filter
is in one helper and nowhere else; the enumerating test fails for a read service
that does not use it; and the public crawl test asserts that no member-visible
fixture text appears on any anonymous route. The first is the mechanism, the
second catches an omission, the third catches a mistake in the mechanism.

*The enumerating test only covers what it can.* Its shape — seed a `member` row
and a `world` row, read as an anonymous audience, expect one back — fits services
that return subject rows and does not fit `readiness()` or `path()`, which return
computed numbers. Pretending otherwise would produce a registry full of entries
asserting nothing, which is worse than a shorter registry: it would read as
coverage. So the registry lists row-returning read services, and the aggregates
are covered separately by asserting that what they count is what the audience
could see.

**The percentage reaches a public surface** → Structural (decision 4) plus a
crawl assertion. Mutation-checked per `docs/06` §8a: put the percentage in the
public view model and watch the right test fail.

*The crawl assertion cannot simply be "no `%` on the page".* A community's own
adopted text may legitimately contain one — *"a change requires 80% of members"*
is a governance rule somebody will publish, and a test that fails on it is a test
that gets deleted the first time it fires. The assertion is on the shape: the
public view model has no readiness field reachable from it, and the rendered page
matches no `\d+\s*%` adjacent to a compliance word. The structural half is the
real defence; the crawl is the backstop.

**Playwright as a runtime dependency** → A headless Chromium per export is
megabytes of RSS and seconds of CPU. It runs in the job worker, which is already
serialised and already the slow lane, and an export that takes eight seconds is
fine because it is a job with a link. `docs/00` §8 already says revisit if the
memory cost bites; this phase is where we find out.

**A stored git token leaks** → Encrypted at rest, write-only, absent from logs
and exports, revocable by deletion. The test asserts the property that matters —
that the stored value cannot be decrypted without the key — rather than that the
bytes differ from the plaintext, which base64 would satisfy. The residual risk is
a compromised server with the config secret, at which point the token is not the
worst thing lost.

**The export bundle drifts from what the app shows** → It is generated from the
same services the screens use and the same renderer (decision 7a), not from a
second query layer. The check is a plain test over the produced file rather than
an e2e one: "readable without the app" cannot be demonstrated by a suite whose
web server is running. The e2e spec requests the export and follows the link; a
separate test unpacks the artefact it produced, with nothing serving, and asserts
the decision count and one adopted definition match the register.

**Half-translated German reads worse than English** → The visible fallback is the
mitigation and also the admission. A community that would rather see clean
English can pick English; a community that wants German gets German with the gaps
marked, which is honest and fixable.

**410 tells an anonymous visitor a page once existed** → Accepted, stated in
decision 3. Lying to somebody holding a link the community gave them is worse.

## Migration Plan

One migration, additive. `visibility` columns default to `member`, which is
exactly the current effective behaviour, so every existing row keeps behaving as
it does today and no community's content becomes public by upgrading. New tables
start empty; a community with no exception has no exception, and a community that
never links a remote has no credential row.

Deploy is migrate → rebuild search index → serve, and the rebuild is not
optional here. **An FTS5 virtual table cannot be altered** — SQLite answers
`virtual tables may not be altered` to an `ALTER TABLE … ADD COLUMN` — so
`search_document` gaining a visibility column means dropping and recreating it,
which empties the index. Between the migration and the rebuild every search
returns nothing, for every community.

That is survivable because the rebuild is a command that already exists and takes
seconds, and because it is a deploy step rather than something a running instance
does to itself. It is worth stating plainly rather than discovering: a release
that migrates and serves without rebuilding leaves a product whose search is
silently empty and whose tests all passed.

Rollback is the migration down plus a search rebuild. Nothing in P1–P5 depends on
any of it; every new read path degrades to "everything is member-visible", which
is where the product is today.

## Open Questions

**Where the public index lives in the URL space.** `/p/<slug>` keeps it clearly
separate from `/c/<slug>` and outside the authenticated layout, which is what
matters for the anonymous surface. Whether a community eventually gets a custom
domain is a P7-or-later question and does not change the route shape now.

**Whether the export link should be signed or session-scoped.** Signed and
expiring is written above and is what lets a steward mail the link to an auditor.
The alternative — a download that only works while signed in — is safer and
useless for the case the feature exists for. Resolved in favour of signed, short
expiry, single community, audit-logged on issue and on use.

**What a mirror commit's author is.** The person who froze the decision, with
their Compass identity, or a single Compass service identity? Attribution in git
history is a real disclosure — an email address in a repository a community may
publish. Leaning toward a service identity in the commit author with the human
named in the message body, which keeps history readable and keeps personal email
addresses out of a public repo. To be decided before group 5.

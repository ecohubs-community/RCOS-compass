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
one helper — `visibleTo(ctx)` — returns the drizzle condition. Every list, every
detail read, the search index write, the AI context assembly, the export and the
mirror take it.

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
decision, and who created it. A nightly job reverts expired subjects to `member`
and writes a change-log entry, so the community sees restriction end rather than
discovering it silently continued.

*Why an expiry is mandatory rather than optional:* RCOS §5.3.5 requires
exceptions to be time-bounded. An optional expiry becomes a null on every row
within a month, and the object stops being an exception and becomes a checkbox
with extra words.

### 3. Publishing is a decision, and unpublishing is a 410

Moving an artifact to `world` writes a decision record. It is a governance act
(UI spec §1.6) and the register is where governance acts live; a community that
later asks "when did we make this public, and who agreed?" gets an answer.

Unpublishing sets visibility back and the public route answers **410 Gone**. Not
404, which says the page never existed and is a lie somebody can check against
their own bookmark; not a redirect, which pretends nothing changed. 410 says: it
was here, it isn't now, and this community decided that.

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

**The credential.** Encrypted at rest with a key from config, so a stolen
database file is not a set of working tokens. Write-only from the interface: a
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

## Risks / Trade-offs

**A read path is missed and member content reaches the world** → The single
worst outcome in the phase. Three defences, deliberately overlapping: the filter
is in `visibleTo` and nowhere else; the enumerating test fails for a read service
that does not use it; and the public crawl test asserts that no member-visible
fixture text appears on any anonymous route. The first is the mechanism, the
second catches an omission, the third catches a mistake in the mechanism.

**The percentage reaches a public surface** → Structural (decision 4) plus a
crawl assertion. Mutation-checked per `docs/06` §8a: put the percentage in the
public view model and watch the right test fail.

**Playwright as a runtime dependency** → A headless Chromium per export is
megabytes of RSS and seconds of CPU. It runs in the job worker, which is already
serialised and already the slow lane, and an export that takes eight seconds is
fine because it is a job with a link. `docs/00` §8 already says revisit if the
memory cost bites; this phase is where we find out.

**A stored git token leaks** → Encrypted at rest, write-only, absent from logs
and exports, revocable by deletion. The residual risk is a compromised server
with the config key, at which point the token is not the worst thing lost.

**The export bundle drifts from what the app shows** → It is generated from the
same services the screens use, not from a second query layer. The e2e spec reads
the bundle and asserts the decision count and one adopted definition match what
the register shows.

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

Deploy is migrate → rebuild search index (visibility is now indexed) → serve. The
rebuild is the one non-obvious step: the index gained a column, and a rebuilt
index and an incrementally-built one must agree, which P5 already tests.

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

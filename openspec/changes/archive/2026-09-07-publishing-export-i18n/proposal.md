## Why

Five phases in, a community can decide things and find them again — and none of
it can leave the building. `visibility` is described in three documents and
enforced nowhere: every read path returns everything, because there is nothing to
filter on. That makes the two promises the product is sold on unkeepable. RCOS
exists so a community can *show* how it governs itself, and `docs/10` §1.3 states
in the terms that a community's data is its own, exportable and mirrorable.
Neither is true today.

The order matters. Publishing is the phase where getting it wrong is expensive in
the one direction that cannot be undone: a percentage that escapes as a
compliance claim degrades the standard for everybody (UI spec §1.4), and an
attendee's name published without consent cannot be unpublished from someone's
screenshot. So enforcement comes before any public surface exists, rather than
being added to one.

## What Changes

- **`visibility` becomes a real column and a real filter.** `member | world |
  restricted` on definitions, decisions, documents and artifacts, defaulting to
  `member`. One helper taking an **audience** rather than a member context —
  because an anonymous reader has neither a user nor a membership, and a fake
  context built to satisfy the signature would pass every permission check in the
  product — applied in the query on every read path, with a test that enumerates
  the row-returning read services and fails on one that does not use it.
- **Transparency Exception becomes a first-class object** (UI spec §1.6, RCOS
  §5.3.5): what is restricted, the justification, the expiry, and the decision
  that authorised it. A nightly job expires them, reverts the subject to `member`
  and writes a change-log entry. Restriction is an auditable act with an end
  date, not a permission somebody set once.
- **Publishing is a governance act**, and so is withdrawing. Moving an artifact
  to `world` writes a decision record, and so does taking it back. A community
  also has a switch of its own: with the public index off, every public URL is
  404 whatever is world-visible, so withdrawing a public presence does not mean
  unpublishing eleven artifacts one at a time. Unpublishing returns **410 Gone**,
  not 404 — the page existed, and saying so is the honest answer to anyone
  holding the link.
- **The public artifact index** (RCOS Appendix C.6): anonymous, the binary
  compliance claim with its gap list, **never a percentage**, attribution by
  `roles_and_counts` unless an attendee consented individually. Local definitions
  appear, always labelled *"community addition — not required by RCOS-Core
  v0.1"*.
- **Self-audit** (UI spec §4.8, RCOS §10.1, Appendix C.5): a steward-only
  recorded act writing an immutable dated snapshot — compliance, missing
  artifacts, uncovered clauses, provisional definitions, stale reviews,
  unresolved objections, live exceptions, readiness per layer. It changes no
  state; the public index cites its date. Included because the index is specified
  to carry that date and cannot without it.
- **Export**: Markdown, PDF and JSON as a background job with a signed expiring
  link. Local definitions included and labelled. The bundle opens without the
  app — that is the test.
- **Git mirror**, in two halves that are one mechanism. Every community gets a
  local repository, with no configuration: rendered artifacts and decision
  records committed after each freeze, downloadable as a git bundle. A community
  that wants its own remote links one, and the same commits are pushed there.
  The credential is encrypted at rest, write-only from the UI, and never appears
  in a log, an error, an export or the admin console.
- **i18n**: Paraglide for the interface; English complete, German and Spanish
  translated, and an untranslated string falls back to English **visibly** rather
  than silently. Standard content already ships in all five locales and needs
  only to be selected by the community's own. Definitions stay in whatever
  language the community writes them in, always.

## Capabilities

### New Capabilities

- `visibility`: the three levels, the one filter every read path uses, and the
  transparency exception that is the only way to restrict something — with its
  justification, its expiry, and the job that ends it.
- `publishing`: making an artifact world-readable as a recorded decision, the
  anonymous public index in the shape of Appendix C.6, the binary claim with no
  percentage, attribution by consent, and 410 on unpublish.
- `self-audit`: the recorded act that produces a dated, immutable compliance
  snapshot, changes nothing, and is what the public index cites.
- `export`: the Markdown/PDF/JSON bundle as a background job with a signed
  expiring link, containing local definitions labelled as community additions,
  and readable without the application.
- `git-mirror`: the local repository every community gets, the optional remote a
  community links, what is committed and when, and how the credential is held.
- `localisation`: how the interface is translated, how a community's locale
  selects standard content, what happens to a string with no translation, and why
  a community's own definitions are never translated.

### Modified Capabilities

- `decisions`: freezing must record the visibility of what it adopts, and a
  decision that publishes an artifact is itself a decision — the register has to
  show what was published and when.
- `readiness`: the compliance claim gains an outward form — binary, with the gap
  list and the self-audit date — and the requirement that the percentage never
  appears on a public surface becomes testable rather than stated.
- `documents`: uploaded documents and their passages take a visibility, and an
  export or mirror must carry only what a reader is entitled to.
- `search`: the index must record and filter on visibility, so an anonymous
  reader of the public index never reaches member-visible text through it.
- `tenancy`: `publish_names_policy` and the mirror settings become things a
  community holds and a steward changes.
- `background-jobs`: three new jobs — exception expiry, export, mirror push —
  and the first that produces a downloadable artifact and the first that holds a
  credential.

## Impact

**Schema.** `visibility` and `first_published_at` on `definition`, `decision`,
`document`, `community_artifact`; new `transparency_exception` (carrying the
audience field `docs/03` §3's sketch omits), `self_audit`, a produced-file record
and `mirror_remote`. Not an `export_job` table — the queue already stores kind,
payload and status — and not a `mirror_settings` table, because
`git_mirror_enabled`, `public_index_enabled` and `publish_names_policy` already
sit on `community` and a second copy could disagree with the first. One
migration, all additive; existing rows take `member`, which is the current
effective behaviour.

**The search index is dropped and rebuilt.** An FTS5 virtual table cannot be
altered, so adding visibility to it is a recreate, and the deploy step becomes
migrate → rebuild → serve with the rebuild no longer optional.

**Every read service.** Adding a filter to a query that never had one is where
this phase can silently break P1–P5 — a list that quietly returns less is not a
failing test unless something asserts the count. The enumerating test over the
read paths is the guard, and it is written before the filter.

**Routes.** A new `(public)` group, anonymous and outside the community layout —
the first surface in the product with no `Ctx`.

**Dependencies.** Paraglide (`@inlang/paraglide-js`), wired in first so the five
screens this phase adds are written with message functions rather than extracted
afterwards; `isomorphic-git` or the `git` binary for the mirror; Playwright
already present for PDF rendering (`docs/00` §8), moving from a dev dependency to
a runtime one on the server — kept as its own task so the bundle still ships if
the memory cost bites.

**Config.** No new required variables. Both the export signing key and the mirror
credential key are derived from `BETTER_AUTH_SECRET` with distinct domain
separators — a new required variable means every existing deployment fails to
boot for a feature it may never use, and an optional one means a feature that
silently does nothing.

**Security.** The first anonymous read path, the first stored third-party
credential, and the first signed URL. All three are in `docs/04` §4's "what may
leave the building", and all three are new ways for it to leave.

## Why

Everything built so far is scaffolding around an empty room. A community can be
created, its members can sign in, and the standard is loaded as data — but there
is nowhere to write down what they decided, and no way to find it again. Without
this phase RCOS Compass is a 213-clause reading list with a login screen, and a
community that tried to use it would keep the thing it already has: a Google Doc
nobody can attribute, version, or search, whose last edit is anonymous and whose
tally nobody remembers.

This is the phase that makes the product the sentence it claims to be
(`UI Spec` §6): **see the gap → discuss it → decide it → find it again later.**

## What Changes

- **Definitions with versions.** A definition answers one section of the
  standard, or nothing at all (`scope = local`, `UI Spec` §1.4b). A frozen
  version stays authoritative until the next freeze; the next edit reopens as a
  draft on top of it.
- **Discussions, posts and proposals.** A thread against a clause or a
  definition, with proposals as first-class objects that carry actions rather
  than being posts that look different.
- **Objections with a lifecycle** — `open → withdrawn / addressed / overruled`.
  The app enforces nobody's threshold; it records the state and refuses to hide
  it. A decision frozen over an unresolved objection says so permanently, in the
  register and on its permalink.
- **Consent rounds**, behind a `VotingProvider` interface so VoteCast slots in
  post-MVP as a second provider. A round has a deadline and one response per
  member — consent, objection, or abstain — and its tally *pre-fills* the freeze.
  It never performs it.
- **Freeze** — transactional, idempotent under a double submit, producing a
  gapless decision reference, a definition version, and a change-log entry in one
  act. Plus **Take offline** as an equal path, not a fallback: most real
  decisions in these communities are made in a room, and the app's job is to be
  where the room's outcome lands.
- **Ratification Records are written by the platform**, from the decision that
  adopted the artifact (`docs/12` — resolved 3 Sep 2026). Nobody types a tally
  twice, and the record cannot disagree with the register.
- **Readiness and compliance**, computed and never stored: readiness over
  countable MUST clauses, compliance as a binary outward claim over mandatory
  artifacts, counting only authored sections (`docs/03-data-model.md` §3b, §7).
- **Local definitions** — scope on the definition, the partial unique index, a
  default *Community Agreements* artifact per community, the "Local additions"
  block under RCOS artifacts, and the `standard_feedback` checkbox that captures
  what a community wished the standard had asked for. They get the whole
  machinery and move no number, in either direction.
- **Draft autosave** with `edit_token` concurrency: a stale token does not
  overwrite, and the second editor is shown who else is editing and offered
  *keep mine / take theirs / merge by hand*.
- **Notifications** — an event stream, in-app, plus the weekly digest job.
- **Screens**: Dashboard, Standard browser, Definition detail (the three-column
  hero, tabs below 1024px), Discussions, Discussion thread with the Freeze modal,
  Decision register with reverse lookup.

## Capabilities

### New Capabilities

- `definitions`: what a community has written down — scope, versions, drafts,
  concurrent editing, and the local-vs-standard distinction that decides whether
  a definition moves a number.
- `discussions`: threads, posts, proposals, and the offline path — how a
  community gets from a gap to something worth freezing.
- `consent`: objections with a lifecycle and consent rounds behind a provider
  interface, including what happens when a round is ignored.
- `decisions`: the freeze — atomicity, idempotency, gapless references,
  provisional handling, the change log, and the register that makes a decision
  findable a year later.
- `readiness`: readiness and compliance arithmetic — what counts, what cannot,
  and why the outward claim is binary while the inward number is a percentage.
- `notifications`: what a community is told, where, and the rule that an email
  carries a link and never content.

### Modified Capabilities

- `tenancy`: gains one requirement — a community is created with a default
  *Community Agreements* artifact, in the same transaction, so a local definition
  has somewhere to live from the first day. Nothing existing changes behaviour.

## Impact

**Schema**, using the names `docs/03-data-model.md` §3 already gives them —
`definition`, `definition_draft`, `definition_version`, `clause_coverage`,
`community_artifact`, `standard_feedback`, `discussion`, `post`, `objection`,
`consent_round`, `consent_eligible`, `consent_response`, `decision`,
`decision_attendee`, `decision_clause`, `change_log`. Note that a proposal is a
`post` with `kind = 'proposal'` and a `proposal_version`, not a table of its own.

Two structures carry more weight than their size suggests:

- **`clause_coverage`**, unique on `(community_standard_id, clause_key)`. It is
  the one-owning-definition-per-clause rule made physical (§4, "the single most
  important invariant"), and it is what turns readiness into a count rather than
  a scan.
- **`decision_clause`**, which stores the clause reference **as quoted at
  decision time** and is never rewritten by a migration. A decision that cited
  `3.6.3` under core 0.1 must still say `3.6.3` after 0.2 renumbers, or every
  minute of the versioning work in P1 was wasted.

Plus the partial unique index `UNIQUE(community_standard_id, section_key) WHERE
section_key IS NOT NULL`, and the two CHECK constraints §3 specifies, so the
scope rules hold against a bad migration and not only against a service.

**`notification` has no table in `docs/03` §3.** The UI spec (§4.11) specifies
notifications and the roadmap puts them in this phase, but the data model never
grew the table. Adding it is part of this change.

**Services**: the first tenant-scoped services with real content, so each must
register in `services/registry.ts` — the cross-tenant suite is parameterised over
it and a service that forgets to register fails the build.

**The admin boundary tightens by itself**: every table above is content, and
`tests/unit/admin-boundary.test.ts` already refuses to let an admin service or
route import one. New content service names belong on its `CONTENT` list.

**Jobs**: the weekly digest, and the ratification sweep that finds provisional
decisions once a Decision Matrix is adopted.

**Existing code**: `standard/index.ts` gains no new loading, but
`authoredSections()` becomes load-bearing — it is the denominator of artifact
completeness. `services/tenancy.ts` gains the default-artifact creation.

**First user-authored text the application renders.** Every phase so far rendered
its own strings; this one renders bodies people wrote. So the XSS suite from
`docs/06-testing-strategy.md` §6.6 belongs here rather than in hardening — a
definition body, a discussion post and a proposal each carrying `<img onerror>`,
a `javascript:` URL and a Markdown image payload, plus the grep test that no
`{@html}` receives external data.

**Docs relied on**: `UI Spec` §1.4b, §4 (screens), §5.1, §6; `docs/03-data-model.md`
§3, §3a, §3b, §7; `docs/01-server-client-contract.md` §1; `docs/11-definition-linter.md`;
`docs/06-testing-strategy.md` §7; `docs/12-clause-ownership-report.md`.

**Explicitly not here**: documents and mapping (P4), the AI linter's model call
(P4 — the rule-based checks land here), the Path's ordering weights (P5),
publishing and export (P6), modules (P8).

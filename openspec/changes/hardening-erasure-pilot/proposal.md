## Why

Six phases in, a community can decide things, find them, publish them and take
them away with it. What it cannot do is **leave** — there is no way for a person
to be erased from this product, and `docs/03-data-model.md` §10 has described
how that must work since P0. A community cannot read what we do with their data
either: there is no privacy policy, no terms, and no list of who else touches it.
`docs/10-legal-and-operations.md` §6 dates both to this phase, "before the first
real community".

That is the shape of what a pilot exposes. Two communities are about to put real
governance — real names, real conflicts, real bylaws — into an instance whose
operator cannot yet answer "what happens when someone asks to be forgotten?",
"where is this hosted?", or "is anything broken right now?". The last is not
rhetorical: errors currently reach a log file nobody watches, and
`/admin/status` reports queue depth but not AI spend, mail failures or whether
anybody finished onboarding.

The order matters, and it is the reverse of the temptation. Erasure comes before
the privacy policy, because a policy stating a mechanism that does not exist is
a promise made to people who cannot check it — and the one commitment in
`docs/03` §10 is that this tension is stated *verbatim*, which is only honest if
it is true. Accessibility comes before the pilot rather than after the first
complaint, because the person who cannot use the product is the person least
likely to file a bug about it.

## What Changes

- **A person can be erased, and the register survives.** Erasure replaces the
  profile with a tombstone: every historical attribution renders as *"Former
  member (M-0142)"*, sessions end, the email is released, and not one decision,
  version or change-log entry is edited. Free text that happens to contain a
  name is handled by a **correction** — a new version with a reason, recorded
  like any other — never by rewriting history. `docs/03` §10 in full.
- **The three documents a community reads before adopting a tool**: a privacy
  policy carrying the erasure-vs-register paragraph verbatim and naming the AI
  region, pilot terms (German hosting, export and deletion on request, no DPA
  yet), and a sub-processor list. Served in-app, versioned, and carrying a
  visible *draft — not yet reviewed by counsel* line until a platform admin
  marks a version reviewed. `docs/10` §6.
- **Licence and attribution where the content goes.** CC BY 4.0 for the
  standard's own words and PolyForm NC for the application, on the public pages,
  in every export bundle and in the footer — `docs/00` §12a asked for this in P1
  and it was never carried through (spec-review row 19).
- **Errors stop disappearing.** A scrubbed error record on this instance, not a
  third party: same PII rules as the logs, surfaced on `/admin/status` beside
  the dead jobs. Adding a SaaS tracker in the same phase that publishes a
  sub-processor list would make the list longer for a two-community pilot that
  will not fill a single page of errors.
- **`/admin/status` answers the question it exists for.** AI spend this month
  across tenants, mail delivery failures, recent errors, and the funnel counters
  `docs/00` §12 specified and nothing ever wrote — community created, interview
  completed, first document, first mapping, first definition, fifth definition,
  first export — aggregated per community, no per-member behaviour, one flag to
  switch off.
- **Accessibility becomes a property the suite enforces, not a pass somebody
  did.** The core loop runs at **375px** as well as 1440px, every route is
  keyboard-reachable rather than only the loop, focus moves to the heading on
  navigation, and the axe pass covers the screens P5 and P6 added at every
  viewport. `docs/02-component-guidelines.md` §6, §7.
- **Backup and restore stop being a paragraph.** A snapshot command that takes
  the database *and* the uploads, a restore that is executed rather than
  described, and a drill in the test suite that restores into a scratch
  directory and re-opens a mapped document — `docs/00` §9's own criterion.
- **Feedback from the pilot lands somewhere it can become work.** A member
  reports something from any screen; the report carries the route, the
  community and no page content; `/admin` exports the open ones as Markdown
  shaped for an OpenSpec proposal. The roadmap's "rather than in a chat
  backlog", made mechanical.

## Capabilities

### New Capabilities

- `erasure`: what erasure removes and what it must not, the tombstone and the
  `M-0142` rendering, the correction flow for free text, and the proof that the
  register is unchanged afterwards.
- `legal-documents`: the policy, terms and sub-processor documents as versioned
  content in the product — who may edit them, how a version is marked reviewed,
  what a member sees while one is a draft, and the licence and attribution lines
  that travel with exported and published content.
- `observability`: the scrubbed error record, what may never appear in one, the
  funnel counters and their aggregation, and what `/admin/status` must show for
  an operator to answer "is anything broken".
- `durability`: the snapshot that includes uploads, the restore that is
  executable, and the drill that proves a restored instance opens a mapped
  document.
- `accessibility`: the viewport matrix, keyboard reachability, focus on
  navigation, and the axe coverage that must not be allowed to lag the screens.
- `pilot-feedback`: what a report carries and what it must not, who can read
  them, and the export shaped for a proposal.

### Modified Capabilities

- `authentication`: an account can be erased; erasure ends every session,
  releases the email for reuse, and leaves an account that cannot be signed in
  to rather than a row that is gone.
- `tenancy`: a membership survives its user. Every surface that renders a person
  renders the tombstone instead, and a community's member list says somebody
  left rather than silently shrinking.
- `decisions`: attendance and authorship reference a membership, and the
  register renders an erased person as `Former member (M-0142)` — including in
  exports and on public pages. A correction is a new entry, never an edit.
- `export`: a bundle contains no erased person's name, in any file. The licence
  and attribution lines the bundle also gains are stated once, under
  `legal-documents`, because they are the same requirement as the one the public
  pages carry.
- `request-pipeline`: an unhandled error is recorded as well as logged, with the
  same scrubbing, and the response the visitor sees is unchanged.

The admin console gains three screens — the status page's new panels, the
legal-document review gate and the feedback export — but no requirement of its
own: each belongs to the capability that defines the behaviour, and stating it
twice is how two specs come to disagree.

## Impact

**Schema.** `user` gains tombstone columns (erased-at, and who carried it out —
not the address, not a hash of it: a hash of an email is guessable from a known
address, so keeping one after an erasure request would undo the act it records);
`membership` gains a per-community sequence so `M-0142` is stable and never
reused; `error_report`; `funnel_event`; `legal_review`; `feedback_report`.
Additive, one migration.

**Every surface that renders a name.** The register, the decision detail, the
self-audit, the attendee list, discussions, document uploads, the audit trail,
notifications, exports, the public pages. This is the phase's real footprint and
the reason the rendering goes through one function with a test that enumerates
the surfaces — the same mechanism the visibility registry used in P6, for the
same reason: a surface added later must fail the suite rather than quietly
print a name.

**No new dependency.** The error store, the counters and the snapshot are all
SQLite and the filesystem. `@axe-core/playwright` is already present; the 375px
project is a config entry.

**Config.** One optional flag to switch the funnel counters off for a
self-hosted instance (`docs/00` §12). Nothing else new, and nothing required.

**Legal, and the limit of what this phase can do.** The documents are drafts
written from the code: the data inventory is real, the sub-processor list is
what the instance actually talks to, the erasure paragraph is what the erasure
code does. They are not legal advice and the product says so on the page until a
human with the standing to do it marks a version reviewed. Seeding a real
community is an operational act this phase prepares for and does not perform.

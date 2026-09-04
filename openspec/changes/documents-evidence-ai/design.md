## Context

P1–P3 built a closed system: everything a community knows, it typed into
Compass. P4 opens it to a file the community already has, and to a model that
reads that file. Those are the two most hostile inputs the product will ever
take, and they arrive together — an uploaded document is untrusted, and it is fed
to a language model, which is the whole prompt-injection surface
(`04-security.md` §5).

Three constraints shape everything below.

**The manual path is the product; the AI is an accelerant.** CI runs with
`AI_PROVIDER=null` and the exit criteria say the whole flow works there. This is
not a hedge about model quality — it is that governance text is among the most
sensitive text a community holds, some hosted tiers reserve the right to train on
it, and a community that declines must lose speed and nothing else.

**A model output can only become a suggestion.** There is no code path from a
model response to an adopted definition, a confirmed mapping, a permission
change, or a decision. This has to be structural, not a convention someone
remembers.

**Evidence is a weaker claim than a definition, on purpose.** *"We have language
about this"* is not *"we have decided this"*. The moment evidence moves a
readiness number, the number stops meaning what the rest of the product says it
means, and the outward compliance claim becomes false.

This is also the first phase that writes outside the database. Files on disk have
a lifecycle the database does not manage, and pretending otherwise is how a
deleted community leaves its bylaws on a volume.

## Goals / Non-Goals

**Goals:**

- A community uploads its bylaws and, without any AI configured, reaches a
  definition pre-filled with its own words.
- Every rejection path — too big, wrong type, zip bomb, encrypted, scanned,
  timed out — fails cleanly, says which one it was, and leaves no partial rows.
- The AI seam is one interface and one adapter file, so swapping Google AI Studio
  for a local Ollama is `.env` plus a file.
- Budgets are per-user first, so one enthusiastic member cannot drain the
  community's month.
- The injection defence is provable by a test that would fail if the structural
  invariant were removed.

**Non-Goals:**

- OCR. A scanned PDF is reported as unreadable and stops there.
- Fetching a document by URL — an SSRF surface with no product value yet.
- Streaming AI output. Mapping is a job, not a conversation.
- Any AI feature beyond mapping suggestions and the two `ai-assist` linter rules.
- Bounding boxes in the viewer beyond page and ordinal. The schema keeps `bbox?`
  and P4 leaves it null; highlighting is by passage, not by pixel.
- Steward-adjustable per-member allowances. The fields exist; the editing UI is
  post-MVP (`04-security.md` §5.3).

## Decisions

### 1. Validate before a byte reaches disk, and stream to a temp path

The upload handler reads the multipart stream with a hard byte ceiling, sniffs
magic bytes from the first chunk, and aborts the moment either the declared
extension or the sniffed type disagrees or the ceiling is passed. Only then does
it write, and it writes to a temp path that is moved into
`UPLOAD_DIR/<communityId>/<uuid>` as the last step of the transaction that
creates the `document` row.

*Why:* buffering the whole file to validate it is how a 25 MB limit becomes a
memory-exhaustion vector at concurrency. Moving into place last means a failed
insert leaves no orphan file, and a failed write leaves no orphan row — the
"leaves no partial rows" requirement is a property of the ordering, not of a
cleanup job.

*Alternative considered:* validate after writing, delete on failure. Simpler, and
wrong under a crash — every crash leaves a file nothing references.

### 2. Extraction is a job, and the document row carries its own state

`document.status` moves `uploaded → extracting → extracted | reference_only |
failed`. The worker owns the transition; the upload response returns immediately
with `uploaded`.

`reference_only` is the scanned-PDF and no-text-layer case: the file is kept, it
is readable by a person, and Compass says plainly that it cannot read it. It is a
success state, not a failure — a community that uploaded a scan has not done
anything wrong.

*Why a job:* extraction has a 120 s wall-clock ceiling and a memory ceiling, and
neither belongs on a request. P3's queue already gives at-least-once delivery,
backoff, and dead-lettering.

*What is new:* this is the first job whose failure a member has to see. The
existing queue logs and dead-letters; here the document row carries the reason,
so the failure is visible on the screen the member is already looking at rather
than in a log they cannot read.

### 3. Manual mapping ships first, in its own group, with its own tests

Group order is: schema → upload → extraction → passages and viewer → **manual
mapping and "turn into definition"** → provider seam → AI suggestions → linter
rules. The exit criteria are met at the end of the manual mapping group, with no
AI code written.

*Why this order matters more than usual:* if the AI arrives first, the manual
path becomes the thing that is technically supported and practically untested.
Building it first, and making it the path the e2e spec drives, means the
`AI_PROVIDER=null` guarantee is continuously proved rather than periodically
checked.

### 4. The provider seam returns text and usage; tasks own their schemas

`AiProvider` is `{ id, generate(request): Promise<AiResult> }` with
`AiResult = { text, parsed?, usage: { in, out }, model }`
(`00-architecture.md` §4). A *task* — mapping, `enf.auditable`, `type.mismatch` —
owns its prompt constant, its valibot schema, and its output ceiling. The
provider knows nothing about tasks; the task knows nothing about providers.

`null` returns a documented "unavailable" result rather than throwing, because
every caller has to handle unavailability anyway — a member out of budget is the
same case as no provider configured, and one code path for both is one code path
that gets exercised.

`fixture` replays recorded responses from `tests/fixtures/ai/*.json`. Re-recording
is a deliberate, reviewed act (`06-testing-strategy.md` §8).

*Alternative considered:* a provider that also parses and validates. Rejected —
it puts task-specific schemas behind the seam, so adding a task would mean
touching every adapter.

### 5. No model output writes state — enforced by module boundary

Everything under `src/lib/server/ai/` may import types and the provider. It may
**not** import any service that writes, and an ESLint boundary rule plus a test
asserts it, the same way the admin console is kept out of content tables and
components are kept out of `$lib/server`.

An AI task therefore *returns* suggestion data. The caller — an ordinary service,
with an ordinary `Ctx` and permission check — writes `evidence` rows in state
`suggested`. Confirming one is a human act with a permission and an actor.

*Why a boundary rather than review:* "no AI call may write state" is exactly the
kind of invariant that survives three phases and then quietly dies in a hurry.
The linter's `ai/` directory has the same shape of rule already
(`tests/unit/linter.test.ts` asserts it cannot reach a provider), and it caught
nothing only because nobody has tried yet.

### 6. Budgets are checked before the call and recorded after it

`ai_usage` is a rolled-up counter keyed by `(community, actor, period_day,
period_month)`. A task checks the per-user day and month first, then the
community month, and refuses before spending anything. After a call returns, the
actual token counts are added — so an underestimate costs at most one call's
overshoot, and the counter is never wrong in the direction that lets a member
keep going.

A refusal is not an error. It returns the same "unavailable" result the `null`
provider returns, with a reason the UI states plainly: *"You have used your AI
budget for today. Everything still works without it; mapping and linting can be
done by hand."*

*Alternative considered:* reserving tokens before the call and reconciling after.
More accurate, and it introduces a reservation that leaks whenever a process
dies mid-task.

### 7. Extracted text reaches the model as data, inside a delimited block

The system prompt states that the block is data and never instructions; the
document text is delimited and never interpolated into the instruction section.
This is defence in depth and is stated as such — **the real defence is decision
5**, and the injection test asserts the outcome (no state changed), not the
prompt's wording. A test that asserted the wording would pass forever while the
protection rotted.

### 8. The linter gains a provider argument and stays synchronous without one

`lint(input)` keeps its signature and its rule-based behaviour. A second entry
point, `lintWithAssist(input, options)`, is async, runs the rule set first, and
adds the two `ai-assist` findings when a provider is available and in budget.
With no provider it adds a finding saying the check was **not run** — the same
shape as `all.vague.unavailable` in P3, and for the same reason: a community must
not believe their text was checked for something nobody checked.

*Why not one async function:* the freeze path and the discussion thread call the
linter on every render, and making that path async and provider-dependent to
serve two rules would put an optional feature in the way of a required one.

### 9. Files are addressed by id and served by a route that re-checks membership

No public path, no signed URL in MVP. `GET /c/[slug]/documents/[id]/file`
resolves the tenant through the same pipeline as everything else, checks the
membership, and streams from disk. Deleting a community deletes its directory;
that is a documented step in the deletion path, not a sweeper.

## Risks / Trade-offs

**A member uploads a 300-page PDF and waits with no feedback** → The document row
is created immediately with `status = uploaded`, the screen shows it as
extracting, and the page reflects the status transition. Slow is acceptable;
silent is not.

**Extraction libraries are a new attack surface** (`unpdf`, `mammoth`, ODT) →
They run in the worker, behind a wall-clock and memory ceiling, on a file that
has already passed type and size checks. A crash fails one job and one document.
The audit gate in CI covers the advisories.

**300 pages extracted, the rest reported** → A 400-page document is partially
extracted and says so. Silently truncating would produce a community confidently
believing Compass had read all of its bylaws.

**The AI budget makes the good case feel worse than the free case** → Mapping is
the expensive task and is charged to the member who started it, capped per run,
and resumable. A member who runs out mid-document keeps every confirmed mapping
and continues by hand.

**Evidence drifts from its passage** → Re-uploading a document does not mutate the
old one; evidence points at a passage that keeps existing. When a passage's
document is superseded or the community's standard version changes, evidence goes
`stale` rather than being deleted or silently repointed. Stale evidence is
visible and re-confirmable.

**Storage outlives the record** → Deletion of a community deletes its upload
directory in the same operation that soft-deletes the tenant, and the export
includes the original files. Both are tested; the alternative is bylaws sitting
on a volume after a community asked to leave.

**The `null` path becomes a second-class citizen anyway** → The e2e spec runs on
`null` and reaches the exit criteria through the manual path only. If that spec
ever needs a provider to pass, the guarantee has already been broken.

## Migration Plan

One migration adds `document`, `passage`, `evidence`, `ai_call` and `ai_usage`.
All are new tables with no backfill; no existing row changes shape.

Configuration gains the upload and AI variables. `AI_PROVIDER` defaults to
`null`, so an existing instance that takes this deploy without touching its
`.env` gets documents and manual mapping and no AI at all — which is the correct
default and the one CI runs.

Rollback is the migration down plus deleting `UPLOAD_DIR`; nothing in P1–P3
depends on any of it.

## Open Questions

- **ODT extraction has no obvious well-maintained library.** RCOS publishes its
  templates in `.odt`, so the format matters. If nothing suitable and correctly
  licensed exists, the fallback is to unzip and read `content.xml` directly —
  which is a small amount of code but is XML parsing on hostile input, so it
  needs its own ceiling and its own fuzz case. Decide during group 2.
- **Where "turn this into a definition" lands when the clause's section already
  has a definition.** Pre-filling a draft over an adopted definition would be a
  proposal, not a draft. Likely answer: it opens a discussion with the passage's
  text as the first proposal, which is the P3 path for changing something already
  adopted — but that should be confirmed against the UI spec before group 5.
- **Whether a document is visible to every member or only to stewards.**
  `04-security.md` §2 says any member may upload and confirm mappings, which
  implies member-visible. Uploaded bylaws can contain names and addresses, though,
  and the transparency exception machinery is P6. Assume member-visible for MVP
  and note it.

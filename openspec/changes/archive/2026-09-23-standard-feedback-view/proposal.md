## Why

`standard_feedback` rows are written — ticking *"RCOS should require this"* on a
new local definition stores one — and nothing reads them. The UI spec promised
an exit (§1.4b, review-log finding 92: *"`standard_feedback` had no exit"*):
the entries appear in the community's own export and on a settings page. Neither
exists, so today the capture is a door with nothing behind it.

What a community loses without this: the one record of *"what we wished the
standard had asked for"* is invisible to the people who wrote it, cannot be
copied into a message to the standard's stewards, and does not leave with the
community when it exports everything. RCOS §11.2 asks for this loop; a table
nobody can read does not close it.

Reasoning: `UI Spec — v0.1 (draft).md` §1.4b (kind 3, gaps in RCOS),
`docs/07-spec-review-log.md` #81 and #92, `docs/04-security.md` §1 (record
feedback: steward and member), `docs/03-data-model.md` §10 (how a person is
named, including after erasure), `docs/10-legal-and-operations.md` §1.3 (the
export is everything).

## What Changes

- **A read service** returns the community's feedback on the standard, newest
  first: the words, the standard and version it is about, the clause ref where
  one was named, the definition it came from, who recorded it and when. The
  person is named through `personLabel`, so an erased author reads as a former
  member. An entry tied to a definition the reader may not see is left out, so
  the list cannot leak a restricted definition's title.
- **A settings panel, *Feedback on the standard***, listing those entries with a
  link to each one's definition (or the clause in the standard), and an empty
  state that says how an entry gets there. Readable by every member, like
  *What we are not showing*: the entries are members' own words, and recording
  one is already a member right.
- **The export bundle carries it**: `standard-feedback.md` and
  `standard-feedback.json`, filtered the same way as the page, and named in the
  readme. Nothing is sent anywhere — sharing upstream stays a deliberate act.
- No new capability and no migration: reading uses `community.read`, and the
  table already exists.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `definitions`: the community can read back what it recorded as feedback on
  the standard.
- `export`: the bundle carries that feedback.

## Impact

- `src/lib/server/services/standard-feedback.ts` (new), `export.ts`.
- `src/routes/(app)/c/[slug]/settings/standard-feedback/` (new), the settings
  layout's panel list, `src/lib/links.ts`, `messages/en.json`.
- Test registries: `tests/support/person-surfaces.ts` (a new module that names
  people), `tests/support/routes.ts` (a new page, scanned for accessibility).
- The e2e seed route gains an option to record one entry, because no screen
  creates a local definition yet — the service is the only way in today.

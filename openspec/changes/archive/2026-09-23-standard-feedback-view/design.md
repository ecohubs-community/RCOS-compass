## Context

`standard_feedback` (`src/lib/server/db/schema/definitions.ts`) is written by
`createDefinition` when a local definition is created with *"RCOS should require
this"* ticked. It carries the community, an optional definition and clause key,
the standard and version, a kind, the body, `created_by` (a user id) and a
timestamp. Nothing reads it.

## Goals / Non-Goals

**Goals:** a member can see what the community recorded; a steward's export
carries it; nobody's name survives their erasure; nothing restricted leaks.

**Non-Goals:** sending anything upstream, marking an entry shared, editing or
deleting entries, a copy-to-clipboard control, or the local-definition creation
screen that would produce entries from the UI (a separate change).

## Decisions

- **Readable by every member (`community.read`), not a new capability.** Members
  record feedback (`feedback.record`); a list of their own words hidden from them
  would be odd, and the transparency panel set the precedent that a settings
  page can be read by everybody and changed by stewards. There is nothing to
  change here, so the page has no steward-only control. `feedback.share` stays
  unused until an upstream channel exists.
- **Visibility follows the definition.** The body is, today, the definition's
  title. An entry whose definition is restricted from the reader is omitted —
  in the query, through `visibleTo`, not after it. An entry whose definition was
  deleted (`definition_id` set null) is still shown: the words are the
  community's and outlive the draft.
- **The person is joined through their membership in this community**, from
  `created_by` (a user id), and named with `personLabel`, so an erased author
  reads as *Former member (M-0042)* on the page and in the bundle alike.
- **The export reads through the same service** when the audience is a signed-in
  member (the only audience `buildBundle` is given). Any other audience gets an
  empty list rather than a second, unguarded query.
- **Clause refs come from the pinned standard** (`getStandard(id, version)`), so
  an entry keeps the ref of the version it was written against.

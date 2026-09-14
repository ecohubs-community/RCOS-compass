## Context

- **Storage is already UTC.** Every timestamp column is
  `integer(..., { mode: 'timestamp_ms' })`, epoch milliseconds. A few period keys
  (`ai_budget` days, `YYYY-MM`) are strings computed in the community's zone on
  purpose.
- **`community.timezone`** (IANA, default `UTC`) exists. It is set when a platform
  admin creates a community, and used for decision reference years
  (`decisionYear`) and AI budget days. No screen lets a steward change it.
- **Language is the community's** (`src/lib/server/locale.ts`). The root layout
  passes `locale` to the client so hydration renders in the same language.
- **Display is ad hoc.** About twenty `toLocaleDateString('en-GB', …)` /
  `toLocaleString('en-GB', …)` calls, with no `timeZone`, plus
  `format.ts#shortDate` using `getLocale()` and no zone. During SSR these format
  in the server process's zone. After hydration they format in the browser's.
- **Date input.** One: the freeze form's `reviewDueAt` (`type="date"`), parsed with
  `Date.parse`, which reads a bare date as UTC midnight.
- **No per-person setting** of any kind exists besides the account page (two-factor,
  erasure).

## Goals / Non-Goals

**Goals:**

- One rule for storage, one for display, one for calendar dates, each tested.
- Server-rendered and hydrated text identical.
- A person sees moments in their own zone without having to set anything.

**Non-Goals:**

- A per-person interface language (the interface stays the community's).
- Working hours, recurring schedules, iCal.
- Rewriting stored period keys.

## Decisions

### Three rules

1. **A moment** (something happened, or will happen, at an instant) is stored as UTC
   epoch milliseconds and shown in the **viewer's** zone.
2. **A calendar date a community sets** (a review date) is the start of that day in
   the **community's** zone, stored as the UTC instant. It is shown as a date, in the
   community's zone, so "review on 1 March" reads 1 March to everyone.
3. **A community's own periods** (a decision's year, a budget day) keep using the
   community's zone, as today.

**Why dates follow the community, not the viewer:** a review date is a date on the
community's calendar. A member in another time zone seeing "28 February" for it
would be reading a different fact.

### A person's zone, detected once

`user.time_zone` (IANA string, nullable).

- **Detection.** The root layout, on mount, when a signed-in person has no zone,
  posts `Intl.DateTimeFormat().resolvedOptions().timeZone` to the account route's
  `detectTimeZone` action with `fetch` + `deserialize`, the same pattern the upload
  drop zone uses. The action validates the zone (see below) and sets it **only if
  still null**. It never overwrites a chosen zone, so a person travelling doesn't
  have their setting changed under them.
- **Choice.** The account page has a *Time zone* select of `Intl.supportedValuesOf(
  'timeZone')`, grouped by region, with the current one selected and a "Use this
  device's time zone (Europe/Lisbon)" button when the device differs.
- **Validation.** A zone is accepted only if
  `new Intl.DateTimeFormat('en', { timeZone })` does not throw. That is the runtime's
  own list, identical on server and client for supported runtimes.

**Why not a cookie or a header:** the zone must be known to background jobs (the
digest) and emails, which have no request.

**Why not read the browser's zone on every render:** SSR can't, so the first paint
would be in the wrong zone and flip after hydration — the bug this change removes.

### Which zone a page uses

`timeZoneFor(user, community)` returns `user.time_zone ?? community.timezone ?? 'UTC'`.
The root layout load adds `timeZone` beside `locale`:

- **community pages** use the member's zone, falling back to the community's;
- **account and admin pages** use the person's zone, falling back to UTC;
- **public pages** use the community's.

Jobs and emails call the same resolver for the recipient.

### One formatter

`$lib/time/format.ts`, pure and importable on both sides:

```
formatMoment(ms, { timeZone, locale, style })
  style: 'date' | 'dateShort' | 'dateTime' | 'time' | 'deadline'
formatCalendarDate(ms, { timeZone: communityZone, locale })
formatRelative(ms, now, { locale })
```

- **Explicit zone and locale.** Every `Intl.DateTimeFormat` gets `timeZone` and the
  page's locale. Formatters are cached per (locale, zone, style).
- **Deadlines.** `deadline` appends the short zone name (`timeZoneName: 'short'`),
  for times a member must act before.
- **Relative times.** `formatRelative` uses `Intl.RelativeTimeFormat`. The `now`
  it receives is the load's server time, so SSR and hydration agree; a page that
  must tick updates on the client after mount.

Components read `timeZone` and `locale` from `page.data`. A tiny
`useTime()` helper returns the bound functions, so a call site is
`time.dateTime(ms)`.

**Enforced by a test:** a unit test scans `src/` for
`toLocaleDateString`, `toLocaleTimeString`, or `toLocaleString(` on something other
than a number, and fails listing the files, so the ad-hoc calls don't come back.

### Machine-readable dates stay ISO

Sitemaps, export filenames, JSON manifests and the feedback export keep
`toISOString()` (UTC). They're read by programs, not people. Human-readable text
inside exports (the register's "Decided 12 March 2026") uses the community's zone,
since an export is the community's record.

### A steward changes the community's zone

The language settings screen becomes *Language and time*. It gains a *Time zone*
select, saved by `setCommunityTimeZone(ctx, zone)` (`settings.manage`, validated as
above). Changing it:

- does not rewrite stored instants;
- does not change existing decision references (their year was fixed when frozen);
- changes how calendar dates display and where new review dates fall.

### Review date input

The freeze action reads `reviewDueAt` (`YYYY-MM-DD`) as the start of that day in
`ctx.community.timezone`, using `Intl` to find the UTC offset at that local
midnight (DST-safe: compute the offset for the candidate instant and correct once).
The form shows "in Europe/Lisbon time" beside the field.

## Risks / Trade-offs

- **[The detected zone is wrong (VPN, privacy-hardened browsers report UTC)]** → The
  account page shows it and offers to change it. Detection never overwrites a
  chosen zone.
- **[Runtimes disagree on the zone list]** → Validation uses the running runtime.
  An unknown stored zone falls back to the community's when formatting, never
  throws.
- **[DST gaps for a local midnight]** → Midnight is never skipped in common zones;
  the conversion corrects once and is tested on a DST-change date.
- **[Twenty call sites changed at once]** → Mechanical. Each screen's existing e2e
  and a11y tests cover it, plus the hydration test.

## Migration Plan

1. Migration: `user.time_zone` text nullable. Data inventory row.
2. Deploy. Every existing person has no zone until their next page load detects one;
   until then they see the community's.
3. Existing review dates stored as UTC midnight stay as they are (within a day of
   the intended date). Not rewritten.
4. Rollback: the previous build ignores the column.

## Open Questions

_None blocking._

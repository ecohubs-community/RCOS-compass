## 1. Storage rule and the person's time zone

- [ ] 1.1 Migration: `user.time_zone` (text, nullable); `docs/13-data-inventory.md` row; erased with the account in the erasure path
- [ ] 1.2 `isTimeZone(value)` validation through `Intl.DateTimeFormat`; `timeZoneFor(user, community)` resolver (person → community → UTC, tolerating an unknown stored zone)
- [ ] 1.3 Tests: unit — validation accepts IANA zones and refuses "Mars/Olympus" and empty; resolver fallbacks; a schema test that every date-like column is `timestamp_ms` (no text dates besides the named period keys); erasure test clears `time_zone`

## 2. One formatter

- [ ] 2.1 `$lib/format/time.ts`: `formatMoment` (date, dateShort, dateTime, time, deadline with zone name), `formatCalendarDate`, `formatRelative`; explicit `timeZone` and locale on every `Intl` call; cached formatters
- [ ] 2.2 Root layout load adds `timeZone`; a `useTime()` helper binding page `timeZone`, `locale` and, for calendar dates, the community's zone
- [ ] 2.3 Tests: unit — the same output under `TZ=UTC` and `TZ=Pacific/Kiritimati`; German month names; deadline shows the zone name; a calendar date shows the same day for viewers in UTC−10 and UTC+14; a guard test that fails on `toLocaleDateString` / `toLocaleTimeString` / date `toLocaleString` anywhere in `src/`

## 3. Detecting and choosing a zone

- [ ] 3.1 Account route actions `detectTimeZone` (sets only when null) and `setTimeZone`, both acting on the signed-in user only
- [ ] 3.2 Root layout: on mount, when signed in with no zone, post the browser's zone once (fetch + `deserialize`); nothing without JavaScript
- [ ] 3.3 Account page: *Time zone* select from `Intl.supportedValuesOf('timeZone')` grouped by region, current selected, "Use this device's time zone" when it differs; works without JavaScript (plain select and submit)
- [ ] 3.4 Tests: integration — detection sets a null zone and leaves a set one alone, an invalid zone is refused, another user's zone can't be set; e2e — first load in a browser with `timezoneId: 'Europe/Lisbon'` stores it, a later load with `Asia/Tokyo` doesn't change it and the account page offers the switch; no-JS project changes the zone with the select

## 4. Every screen through the formatter

- [ ] 4.1 Replace the ad-hoc calls: dashboard, legal pages, settings (path, transparency, export, publishing, mirror), discussion thread, members, decisions, feedback, audit, definition, decision page, public pages, admin legal and communities, `documents/format.ts`
- [ ] 4.2 Deadlines named: consent round close, export link expiry
- [ ] 4.3 Human-readable dates in exports and printable artifacts in the community's zone; machine dates (sitemap, filenames, JSON) stay ISO UTC
- [ ] 4.4 Tests: e2e run with the browser in `Asia/Tokyo` against a UTC server — the discussion thread, decision page and dashboard show identical text before and after hydration (compare server HTML to hydrated text); existing screen e2e and a11y suites pass

## 5. Calendar dates and the community's zone

- [ ] 5.1 Freeze action reads `reviewDueAt` as local midnight in the community's zone (DST-safe); the form says which zone
- [ ] 5.2 `setCommunityTimeZone(ctx, zone)` (`settings.manage`, validated), registered in the tenant registry; the language settings screen becomes *Language and time* with the select
- [ ] 5.3 Tests: unit — local midnight conversion for Europe/Lisbon on a normal day and on both DST change days, and for Pacific/Kiritimati; integration — a review date set in a Lisbon community reads the same date for a Los Angeles viewer; a member can't change the community zone; changing it leaves decision references and stored instants unchanged

## 6. Documentation

- [ ] 6.1 `docs/03-data-model.md`: the three time rules, `user.time_zone`
- [ ] 6.2 `docs/02-component-guidelines.md`: dates only through `$lib/format/time.ts`
- [ ] 6.3 `docs/00-architecture.md`: the zone resolver used by pages, jobs and emails

## Why

Compass stores every moment correctly, as UTC milliseconds, and shows them
inconsistently. About twenty screens format dates on their own with
`toLocaleDateString('en-GB')`:

- **The wrong time zone.** A server-rendered page shows times in the server's zone
  (UTC in production), and the browser re-renders them in its own zone after
  hydration. A consent round closing at 18:00 in Lisbon can read 17:00 and then
  jump.
- **The wrong language.** Every screen formats in British English, whatever the
  community's language.
- **Date-only values are taken as UTC midnight.** A review date typed as 1 March
  becomes 28 February for anyone west of Greenwich.

The notifications change needs a person's time zone to send a digest "on Monday
morning". The principle is wider than that: store in UTC, show every person times
in their own time zone.

What a community loses without this: the moments governance hangs on — when a
round closes, when a decision was recorded, when a definition is due — read
differently to different members, and a member in another time zone reads the
wrong day.

Reasoning:
- `docs/03-data-model.md` (timestamps);
- `src/lib/server/services/decisions.ts#decisionYear` (why `community.timezone`
  exists);
- `docs/01-server-client-contract.md` (data through loads);
- UI spec §1.6 (the community's language).

## What Changes

- **The rule, written down and tested:** every stored moment is UTC epoch
  milliseconds. A calendar date a community sets (a review date) is the start of
  that day in the **community's** time zone, stored as UTC.
- **A person's time zone.** `user.time_zone` (IANA, nullable):
  - detected from the browser the first time a signed-in person loads a page and
    none is set;
  - never overwritten automatically after that;
  - changeable on the account page, including "use this device's time zone".
- **Which zone a page uses:** the person's → the community's → UTC. Anonymous
  public pages use the community's.
- **One formatter.** `$lib/format/time.ts` formats a moment for a zone and the
  page's locale: date, date and time, time, and relative ("2 hours ago"). It always
  passes an explicit `timeZone`, so server rendering and hydration agree. Every
  screen uses it; the ad-hoc `toLocaleDateString('en-GB')` calls go.
- **Showing the zone where it matters.** A time that is a deadline (a consent
  round's close, an export link's expiry) names the zone ("18:00 WEST").
- **A community's time zone can be changed by a steward**, on the language
  settings screen, which becomes *Language and time*. It is set only at creation
  today.
- **Date input.** The freeze form's review date is read in the community's time
  zone.

## Capabilities

### New Capabilities

- `time-display`:
  - how moments are stored and which time zone a person sees them in;
  - how a person's time zone is detected and changed;
  - how calendar dates are interpreted;
  - that server and browser render the same text.

### Modified Capabilities

- `localisation`: a steward can change the community's time zone as well as its
  locale, and changing either touches nothing else.

## Impact

- **Schema:** `user.time_zone` (text, nullable). `community.timezone` already
  exists.
- **Server:**
  - a `timeZoneFor(user, community)` resolver;
  - the root layout load adds `timeZone`;
  - a form action on the account page for setting it, and one for detection;
  - `setCommunityTimeZone` beside `setCommunityLocale`;
  - the freeze action converts the review date using the community's zone;
  - exports and printable pages format in the community's zone.
- **Client:**
  - `$lib/format/time.ts`;
  - a one-time detection in the root layout (a form post, only when unset);
  - the account page's time zone field;
  - about twenty call sites moved to the formatter.
- **Erasure:** `user.time_zone` is erased with the account, and listed in
  `docs/13-data-inventory.md`.
- **Tests:**
  - a unit test that the formatter renders the same string for the same zone
    regardless of the process's `TZ`;
  - a lint-style test that no component calls `toLocaleDateString`,
    `toLocaleString` on a date, or `toLocaleTimeString` directly;
  - an e2e in a browser time zone different from the server's that sees no text
    change after hydration.
- **Out of scope:**
  - per-community-member working hours;
  - recurring schedules;
  - calendar exports (iCal).

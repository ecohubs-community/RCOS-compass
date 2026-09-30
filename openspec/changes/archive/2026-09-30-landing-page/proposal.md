## Why

The front page for somebody signed out was a paragraph and a sign-in button. It
did not say what Compass is for, who it is for, or how a community gets in —
which during the pilot is by asking, because communities are set up by hand and
there is no sign-up form. Nothing linked to it, so nothing found it: the sitemap
listed community pages only, there was no description, no link preview, and no
favicon file behind the `<link rel="icon">` in `app.html`.

`design_files/platform/RCOS Compass Landing Page.html` is the page the product
should have. Built as drawn, though, it would claim things the app does not do —
a Word export, reading photos, an AI that answers questions, a linter that
rewrites the rule, members choosing the Path's priority, importing any framework
as your standard. AGENTS.md: never show what the app cannot produce.

Reasoning: `UI Spec — v0.1 (draft).md` §9 (what is not in the product) and §7
(Q&A parked), `docs/08-roadmap-mvp.md` (P8 modules; OCR under future ideas),
`docs/10-legal-and-operations.md` (pilot plan, no plan or quota copy, not "open
source"), `docs/02-component-guidelines.md` (tokens, Tailwind only, 44px
targets, contrast), `openspec/specs/search` (the lookup never answers).

## What Changes

- **A landing page at `/`, for everybody**: hero, a thirty-second tour of five
  stages, a year in a fictional community told in fourteen scroll steps, the
  questions it answers, what RCOS is, who it is for, and a closing call. It
  replaces the old signed-in list of communities: a signed-in person gets an
  **account menu** in the header instead — their email, links to their own
  communities, and sign-out (a native disclosure until hydrated, so it works
  without JavaScript).
- **Every claim held to the app.** Copy rewritten where the design overstated:
  import names the formats the upload accepts; mapping is suggested then
  confirmed; the linter's finding is its real wording and the member writes the
  fix; the lookup points at rules and never answers; exports are PDF, Markdown
  and JSON, and a published page; stewards choose the Path's priority. Modules
  are shown with a "Coming later" label. Percentages appear only as the members'
  own readiness view, captioned as such.
- **"Request pilot access"** is a `mailto:` to a new optional `CONTACT_EMAIL`.
  Without it the buttons and the footer's Contact link are not rendered.
- **Search and previews**: title, description, canonical, Open Graph and Twitter
  tags with a 1200×630 image, JSON-LD (`WebSite`, `WebPage`,
  `SoftwareApplication`, the standard as `CreativeWork`), and a
  `/sitemap-pages.xml` listed first in `/sitemap.xml`.
- **The logo** (`design_files/logos`) as a token-coloured `Logo` component and as
  the favicon — SVG that follows the browser's theme, `.ico`, touch icon, and a
  web manifest.
- **Self-hosted fonts** for the site only: Hanken Grotesk, Newsreader and
  JetBrains Mono, subset like Inter. The app keeps Inter.
- **Site tokens** (`site-*`, `forest-*`) in `app.css`, lifted where the design
  failed AA (muted grey, amber and red text on their tints, the tour's amber
  button).
- Departures from the design for accessibility: the tour reflows with container
  queries instead of shrinking to fit (readable at 375px); story steps not being
  read turn muted grey rather than 28% opacity (1.6:1); the tour never starts by
  itself under reduced motion and only plays while on screen.

Unchanged: authentication, the app's own screens, every permission. No migration.

## Capabilities

### New Capabilities
- `public-site`: the landing page — who sees it, how it asks for access, what it
  may claim, and what it tells crawlers.

### Modified Capabilities
- `runtime-config`: `CONTACT_EMAIL`, optional, validated as an email address.

## Impact

- `src/routes/+page.svelte`, `+page.server.ts`; `src/lib/components/landing/**`,
  `src/lib/components/Logo.svelte`
- `src/routes/sitemap.xml`, new `src/routes/sitemap-pages.xml`
- `src/lib/server/config.ts`, `.env.example`, README deployment table
- `src/app.css` (fonts, tokens, one `html:has([data-site])` rule), `src/app.html`
- `static/`: fonts, favicon set, `og-image.png`, `manifest.webmanifest`
- `messages/en.json`: the page's copy (de/es fall back to English; the front page
  renders in the base locale)
- Version: minor — a new public page and a new optional variable.

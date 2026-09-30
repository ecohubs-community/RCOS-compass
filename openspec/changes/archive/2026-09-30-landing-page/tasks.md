## 1. Foundations

- [x] 1.1 Site tokens and the three self-hosted font families in `src/app.css`; contrast measured and recorded beside them
- [x] 1.2 `Logo.svelte` from `design_files/logos`; `static/favicon.svg` (light and dark), `.ico`, touch and manifest icons, `manifest.webmanifest`, links in `app.html`
- [x] 1.3 `CONTACT_EMAIL` in `config.ts`, `.env.example`, README; tests in `tests/unit/config.test.ts`

## 2. The page

- [x] 2.1 Nav, hero, final call, footer (legal links as in the app footer)
- [x] 2.2 The tour: five screens in the app's own tokens, container queries, plays only on screen, never by itself under reduced motion
- [x] 2.3 The story: fourteen steps and pictures, scaled stage, readable without JavaScript
- [x] 2.4 Features, RCOS, audiences (the four illustrations with alt text)
- [x] 2.5 Copy in `messages/en.json`, every claim checked against the app; modules marked "Coming later"
- [x] 2.6 `contactLinks` with unit tests; `/+page` renders the landing page for everybody
- [x] 2.7 `SiteAccountMenu`: email, own communities, sign-out; Bits UI menu after hydration, `<details>` before; e2e for going to a community, signing out, no-JS, and an axe scan with it open

## 3. Search

- [x] 3.1 `LandingSeo`: title, description, canonical, Open Graph, Twitter, JSON-LD without `{@html}`, font preloads
- [x] 3.2 `static/og-image.png`; `/sitemap-pages.xml`, listed first in `/sitemap.xml`

## 4. Verification

- [x] 4.1 e2e `front-page.spec.ts`: headline, mailto links, head tags and JSON-LD, icons, tour controls, reduced motion, story progress, no-JS
- [x] 4.2 e2e `public-surface.spec.ts`: the sitemap index reaches the front page
- [x] 4.3 axe scan of `/` clean at every viewport; no horizontal scroll at 375px
- [x] 4.4 `pnpm check`, lint, unit and integration suites

## 5. Shipping

- [x] 5.1 `package.json` minor bump

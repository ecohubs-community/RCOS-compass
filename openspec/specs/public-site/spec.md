# public-site Specification

## Purpose
Covers the instance's public front page: the landing page every visitor sees at `/`, the account menu it carries for a signed-in person (their email, their own communities, sign-out), access requested by mail to `CONTACT_EMAIL` rather than a sign-up form, copy held to what the app actually does, what it tells search engines and link previews, and that it is usable by everyone — without JavaScript, at every width, and without motion for those who ask for less.
## Requirements
### Requirement: The front page is the landing page, for everybody

The front page MUST show the landing page to every visitor, signed in or not.
It MUST show nothing about any community to anyone who is not a member of it.

#### Scenario: A visitor who is not signed in
- **WHEN** somebody without a session opens `/`
- **THEN** the landing page is shown, with one `h1` and a link to sign in

#### Scenario: A signed-in member
- **WHEN** a member opens `/`
- **THEN** the landing page is shown with their account menu in place of the sign-in link

### Requirement: A signed-in person has an account menu

For a signed-in person, the landing page's header MUST offer an account menu
showing the email they are signed in with, a link to each community they are a
current member of, and sign-out. The menu MUST list only the reader's own
communities, MUST say so when there are none, and MUST work without JavaScript.

#### Scenario: Going to a community
- **WHEN** a member opens the account menu and picks one of their communities
- **THEN** they arrive at that community's dashboard

#### Scenario: Signing out
- **WHEN** a member picks Sign out
- **THEN** their session ends and the front page shows the sign-in link again

#### Scenario: No JavaScript
- **WHEN** a signed-in member loads `/` with scripts disabled
- **THEN** the account menu still opens and offers their communities and sign-out

### Requirement: Access is requested by mail

The landing page's request-access links MUST be `mailto:` links to
`CONTACT_EMAIL`, and the page MUST NOT offer a sign-up form. When
`CONTACT_EMAIL` is empty, the request-access links and the Contact link MUST NOT
be rendered.

#### Scenario: A contact address is configured
- **WHEN** `CONTACT_EMAIL` is `pilot@example.org`
- **THEN** every "Request access" link opens a mail to that address with a subject line, and the footer's Contact link writes to it

#### Scenario: No contact address
- **WHEN** `CONTACT_EMAIL` is empty
- **THEN** no request-access or Contact link is rendered, and signing in is still offered

### Requirement: The landing page claims only what the app does

The landing page MUST NOT describe a capability the app does not have. A planned
capability MAY appear only with a visible "Coming later" label. A percentage MAY
appear only as the members' own readiness view and MUST be captioned as seen by
members only.

#### Scenario: A planned module
- **WHEN** the page mentions modules for other kinds of community
- **THEN** the mention carries the "Coming later" label

#### Scenario: The readiness picture
- **WHEN** the story shows a readiness percentage
- **THEN** its caption says it is seen by members only

### Requirement: The landing page describes itself to crawlers

The landing page MUST carry a title, a meta description, an absolute canonical
URL built from `PUBLIC_APP_URL`, Open Graph and Twitter card tags whose image is
an absolute URL that resolves, and one JSON-LD block describing the site, the
page, the application and the RCOS standard. `/sitemap.xml` MUST list a sitemap
that contains the front page.

#### Scenario: A link preview
- **WHEN** a crawler reads `/`
- **THEN** `og:image` is an absolute URL to a PNG that is served, and the canonical is the instance's root URL

#### Scenario: Structured data
- **WHEN** the JSON-LD block is parsed
- **THEN** it is valid JSON whose graph includes `WebSite`, `WebPage`, `SoftwareApplication` and `CreativeWork` nodes

#### Scenario: Discovery from robots.txt
- **WHEN** a crawler follows the `Sitemap:` line to the index
- **THEN** the index lists `/sitemap-pages.xml`, which lists the front page

### Requirement: The landing page is usable by everyone

The landing page MUST have no WCAG 2.1 AA violations at any viewport in the test
matrix and MUST read in full without JavaScript. The product tour MUST be
pausable, MUST NOT start by itself when the reader prefers reduced motion, and
MUST NOT advance while it is off screen.

#### Scenario: Reduced motion
- **WHEN** the reader's system asks for reduced motion
- **THEN** the tour shows its first stage with a "Play tour" control and does not advance

#### Scenario: Choosing a stage
- **WHEN** a visitor presses the third stage of the tour
- **THEN** that stage is marked current and its caption is shown

#### Scenario: No JavaScript
- **WHEN** the page is loaded with scripts disabled
- **THEN** the headline and all fourteen story steps are visible


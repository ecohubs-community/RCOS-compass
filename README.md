# RCOS Compass

A tool that turns the 213 numbered clauses of [RCOS-Core](https://rcos.ecohubs.community)
into a short, ordered list of things *this* community still has to decide — and
then keeps what they decided findable, alive, and attributable.

For intentional communities of 5–150 people, place-based or online.
**It never decides for them.**

> Status: **MVP built, not yet deployed.** Phases P0–P7 of
> [`docs/08-roadmap-mvp.md`](docs/08-roadmap-mvp.md) are in the code; the first
> deployment and the pilot are next. `openspec list` shows what is in flight.

## What it does

- **See the gap** — every RCOS clause, with your community's answer or its absence
- **Discuss it** — clause-scoped threads, proposals, consent rounds, or a record
  of the conversation you had in a room
- **Decide it** — a freeze produces a permanent, attributed decision record
- **Find it again later** — a searchable register that answers questions like
  *"can we spend €800 on the water pump?"*

Readiness is shown inward as a percentage; compliance is stated outward as a
binary yes or no, because that is what [RCOS §10.1.1](https://rcos.ecohubs.community)
requires.

## Running it

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET: openssl rand -base64 32
pnpm install
pnpm dev
```

The app refuses to start on invalid configuration rather than starting wrong, and
tells you which variable is at fault.

| | |
|---|---|
| `pnpm dev` | development server |
| `pnpm check` | types (`svelte-check` + `tsc`) |
| `pnpm lint` | Prettier, ESLint, and the design-token check |
| `pnpm test` | unit + integration (Vitest) |
| `pnpm test:e2e` | end-to-end against a production build, four viewports |
| `pnpm test:gallery` | component gallery + accessibility, against the dev server |
| `pnpm db:generate` | generate a migration from a schema change |

`/dev/components` renders every primitive in every state. It is development-only
and a production build returns 404 for it — there is a test for that.

## Testing

**Nothing ships untested.** Every change that alters behaviour brings its tests in
the same commit; `docs/06-testing-strategy.md` §1 has the per-change bar and what
does not count as a meaningful test.

No test reaches the network, a real AI provider, a real mail server, or a git
remote — all four are stubbed at their interfaces, with a runtime guard as a
backstop. Time and ids are injectable, and CI runs `TZ=UTC` with
`AI_PROVIDER=null`.

Environments, from `docs/06-testing-strategy.md` §2:

| | Purpose | Database | AI | Mail |
|---|---|---|---|---|
| Local dev | day-to-day work | `./data/compass.db` | `null`, or `fixture` | console |
| Unit | pure logic | none | none | none |
| Integration | services against a real DB | temp file **per suite**, migrated fresh | `fixture` | memory |
| E2E | the loop, in a browser | temp, seeded, frozen clock | `fixture` | memory |
| Preview | look at a PR | ephemeral, demo seed | `fixture` | catch-all |
| Staging | release and migration rehearsal | anonymised production restore | live, capped | sandbox |
| Production | real communities | the volume | live | live |

Plus **demo** (public showcase, fictional content, reset nightly) and
**self-hosted** (a community's own container, smoke-tested in CI on every release:
boot, migrate, serve).

## Deployment

`adapter-node` on a server with a real disk — not serverless. SQLite and the
in-process job worker both assume one process with a real filesystem, so **the
MVP runs as a single instance**; that is why migrations run at boot.

The target is a **Plesk server running Node**. The Docker image works too and
CI smoke-tests it, but it is the secondary path.

### Plesk + Node

Node 24 and pnpm (`corepack enable`). Install and build on the server itself —
`better-sqlite3` compiles a native binding for the Node it will run under — and
use pnpm rather than Plesk's *NPM install* button, which would ignore
`pnpm-lock.yaml`.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm prune --prod
```

The application root must then hold `build/`, `node_modules/`, `drizzle/`
(migrations), `standard/` (the RCOS content, read from disk at runtime) and
`package.json`, and the process must start **in that directory** — both
`drizzle/` and `standard/` are found relative to it. In the Node.js settings:
startup file `build/index.js`, application mode *production*.

**Environment.** Set these in Plesk's environment variables, or keep them in a
`.env` and start with `node --env-file=.env build/index.js` — plain `node` reads
no `.env` by itself. Boot validates all of them and refuses to start, naming the
variable, rather than start wrong (`src/lib/server/config.ts`).

| Variable | |
|---|---|
| `NODE_ENV=production` | the production checks below only run in production |
| `PUBLIC_APP_URL` | the public address, e.g. `https://compass.example.org` |
| `ORIGIN` | **the same value as `PUBLIC_APP_URL`.** Required in production: without it adapter-node assumes `http://localhost` and every form submission is refused as cross-site |
| `BETTER_AUTH_SECRET` | required, 32+ characters: `openssl rand -base64 32`. Back it up apart from the data — the export-link and mirror-credential keys derive from it |
| `BODY_SIZE_LIMIT` | required in production, at least `MAX_UPLOAD_MB` + 1 MB (`26M` for the default 25). adapter-node's own 512 KB default refuses every real upload |
| `DATABASE_URL` | `file:/absolute/path/data/compass.db` — outside the document root and outside anything a redeploy replaces |
| `UPLOAD_DIR` | `/absolute/path/data/uploads`, beside the database |
| `SMTP_URL`, `MAIL_FROM` | not checked at boot, but verification links are the only way in; without mail nobody can sign up |
| `ADMIN_EMAILS` | platform admins; empty means no admin console |

Everything else (AI provider, upload and rate limits, log level) has a default;
`.env.example` lists and explains every variable.

**On the Plesk side, check:** that Node 24 is offered; that the app runs as
**one** process — the job worker and the hourly sweep live inside it, so a pool
of several processes, or one that is stopped when idle, breaks background work;
and that `/healthz` answers once it is up. Migrations run on every start.

**The data directory is the instance.** It holds the database and the uploaded
documents, and backing up one without the other is a broken restore.
`pnpm snapshot` / `pnpm restore` take and restore both together (they run from a
full checkout — they need the dev dependencies — pointed at the same
`DATABASE_URL` and `UPLOAD_DIR`). Scheduling them, getting copies off the
machine, and rehearsing a restore on the real host are deferred until close to
the first deployment; `docs/14-pilot-preflight.md` §2 is the checklist.

**PDF in exports (optional).** An export bundle includes a printable PDF only
when the `playwright` package and a Chromium are present at runtime; without
them the bundle is complete minus that file, and its manifest says
`unavailable on this instance`. Playwright is deliberately not a dependency
(`src/lib/server/services/export-pdf.ts`), so install it next to the app, at the
version `@playwright/test` pins in `package.json`:

```bash
# one directory ABOVE the application root, so a redeploy or `pnpm prune` does
# not remove it — Node finds it by walking up from build/
npm install playwright@1.62.1
npx playwright install --with-deps chromium
```

Run the second command as the user the app runs as — the browser is downloaded
into that user's cache. `--with-deps` installs Chromium's system libraries and
needs root; on a Plesk subscription without it, run
`npx playwright install chromium` yourself and ask the server admin to run
`npx playwright install-deps chromium`.

### Docker

```bash
docker build -t rcos-compass .
docker run -p 3000:3000 -v compass-data:/data \
  -e PUBLIC_APP_URL=https://compass.example.org \
  -e ORIGIN=https://compass.example.org \
  -e BETTER_AUTH_SECRET=… \
  -e SMTP_URL=… \
  rcos-compass
```

The image sets `NODE_ENV`, `DATABASE_URL`, `UPLOAD_DIR` and `BODY_SIZE_LIMIT`
itself; `ORIGIN` and `PUBLIC_APP_URL` are deliberately left to you. The `/data`
volume holds both the database and uploaded documents.

## Documentation

| | |
|---|---|
| [`UI Spec — v0.1 (draft).md`](UI%20Spec%20—%20v0.1%20(draft).md) | the product spec |
| [`RCOS Core Specification — v0.1.md`](RCOS%20Core%20Specification%20—%20v0.1.md) | the standard being implemented |
| [`AGENTS.md`](AGENTS.md) | the short version, for anyone (or anything) writing code here |
| [`docs/`](docs/) | architecture, data model, security, testing, roadmap, legal |
| [`openspec/`](openspec/) | change proposals and capability specs |

Non-trivial changes start as an OpenSpec proposal under `openspec/changes/`, not
as code. `docs/` is the reasoning — why the model is shaped this way, and what was
considered and rejected. `openspec/specs/` is behaviour a test can pin down.

## Licensing

**The application code is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md).**

In plain terms:

- A community **may** run its own copy for its own use, and may modify it.
- You **may not** host it commercially, resell it, or offer it as a paid service
  without a separate licence.
- **This is not an OSI-approved open-source licence.** Please do not describe it
  as open source — it is source-available and noncommercial by design.

**The RCOS standard itself is licensed separately and more openly.** The
specification and the governance templates are
[CC BY 4.0](https://github.com/ecohubs-community/RCOS-website),
maintained in the `RCOS-website` repository. Anyone may
implement RCOS, including commercially. The restriction here applies to this
application, not to the standard.

Note on the two directions: this repository consumes the standard's generated
**data** (CC BY 4.0). It does not reuse code from the standard repository, which
is AGPL-3.0 and whose terms are incompatible with this licence.

"RCOS" is a trademark of EcoHubs; see the standard repository's `TRADEMARK.md`.

## Contributing

There is no contribution process yet. If that changes, a CLA will land alongside
it — a noncommercial licence makes the terms of an outside contribution worth
stating explicitly rather than assuming.

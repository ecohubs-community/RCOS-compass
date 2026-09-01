# RCOS Compass

A tool that turns the 213 numbered clauses of [RCOS-Core](https://rcos.ecohubs.community)
into a short, ordered list of things *this* community still has to decide — and
then keeps what they decided findable, alive, and attributable.

For intentional communities of 5–150 people, place-based or online.
**It never decides for them.**

> Status: **scaffolding.** The application boots, but no product feature exists
> yet. See [`docs/08-roadmap-mvp.md`](docs/08-roadmap-mvp.md) for the path to an
> MVP, and `openspec/changes/` for what is in flight.

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

`adapter-node` on a VPS with a mounted volume — not serverless. SQLite and the
in-process job worker both assume one process with a real filesystem, so **the
MVP runs as a single instance**; that is why migrations run at boot.

```bash
docker build -t rcos-compass .
docker run -p 3000:3000 -v compass-data:/data -e BETTER_AUTH_SECRET=… rcos-compass
```

The volume holds both the database and uploaded documents. Backing up one without
the other is a broken restore.

## Documentation

| | |
|---|---|
| [`UI Spec — v0.1 (draft).md`](UI%20Spec%20—%20v0.1%20(draft).md) | the product spec |
| [`RCOS Core Specification — v0.1.md`](RCOS%20Core%20Specification%20—%20v0.1.md) | the standard being implemented |
| [`AGENT.md`](AGENT.md) | the short version, for anyone (or anything) writing code here |
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

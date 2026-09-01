# RCOS Compass

A tool that turns the 213 numbered clauses of [RCOS-Core](https://rcos.ecohubs.community)
into a short, ordered list of things *this* community still has to decide — and
then keeps what they decided findable, alive, and attributable.

For intentional communities of 5–150 people, place-based or online.
**It never decides for them.**

> Status: **specification stage.** No implementation yet. See
> [`docs/08-roadmap-mvp.md`](docs/08-roadmap-mvp.md) for the path to an MVP.

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

## Documentation

| | |
|---|---|
| [`UI Spec — v0.1 (draft).md`](UI%20Spec%20—%20v0.1%20(draft).md) | the product spec |
| [`RCOS Core Specification — v0.1.md`](RCOS%20Core%20Specification%20—%20v0.1.md) | the standard being implemented |
| [`AGENT.md`](AGENT.md) | the short version, for anyone (or anything) writing code here |
| [`docs/`](docs/) | architecture, data model, security, testing, roadmap, legal |

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
